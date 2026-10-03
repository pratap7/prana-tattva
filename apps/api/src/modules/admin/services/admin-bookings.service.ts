import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  prisma,
  Prisma,
  BookingStatus,
  LedgerAccountType,
  LedgerEntryType,
} from '@project-nirvana/db';
import {
  AdminBookingQuery,
  AdminBookingCancelRefund,
  AdminBookingForceComplete,
  AdminBookingTimelineEvent,
} from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

@Injectable()
export class AdminBookingsService {
  constructor(private readonly auditService: AuditService) {}

  async listBookings(query: AdminBookingQuery) {
    const { search, status, from, to, page = 1, limit = 20, exportCsv } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {};

    if (status) {
      where.status = status as BookingStatus;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { consumer: { email: { contains: q, mode: 'insensitive' } } },
        { provider: { providerProfile: { displayName: { contains: q, mode: 'insensitive' } } } },
        { service: { title: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (exportCsv) {
      const allBookings = await prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: { select: { email: true } },
          provider: {
            select: {
              email: true,
              providerProfile: { select: { displayName: true } },
            },
          },
          service: { select: { title: true } },
          payments: { select: { status: true, amount: true } },
        },
      });

      const header =
        'BookingID,Consumer,Provider,Service,Status,PricePaise,PaymentStatus,StartAt,CreatedAt\n';
      const rows = allBookings
        .map((b) => {
          const c = `"${b.consumer.email}"`;
          const p = `"${b.provider.providerProfile?.displayName || 'Practitioner'}"`;
          const s = `"${b.service.title}"`;
          const payStatus = b.payments?.[0]?.status || 'NONE';
          return `${b.id},${c},${p},${s},${b.status},${b.priceSnapshot},${payStatus},${b.startAt.toISOString()},${b.createdAt.toISOString()}`;
        })
        .join('\n');

      return { csv: header + rows, filename: `bookings-export-${Date.now()}.csv` };
    }

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: {
            select: { id: true, email: true },
          },
          provider: {
            select: {
              id: true,
              email: true,
              providerProfile: { select: { displayName: true, slug: true } },
            },
          },
          service: {
            select: { id: true, title: true, mode: true, durationMin: true },
          },
          payments: {
            select: { id: true, status: true, amount: true, gateway: true },
          },
          dispute: {
            select: { id: true, status: true },
          },
        },
      }),
    ]);

    return {
      bookings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBookingTimeline(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        consumer: { select: { email: true } },
        provider: {
          select: {
            email: true,
            providerProfile: { select: { displayName: true } },
          },
        },
        service: { select: { title: true } },
        payments: true,
        session: true,
        dispute: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    const relatedAuditLogs = await prisma.auditLog.findMany({
      where: { entityId: bookingId },
      orderBy: { createdAt: 'asc' },
    });

    const events: AdminBookingTimelineEvent[] = [
      {
        step: 'BOOKING_INITIATED',
        timestamp: booking.createdAt.toISOString(),
        description: `Reserved slot for ${booking.service.title}. Price: ₹${(booking.priceSnapshot / 100).toFixed(2)}`,
        actor: booking.consumer.email,
      },
    ];

    if (booking.slotLockExpiresAt) {
      events.push({
        step: 'SLOT_LOCKED',
        timestamp: booking.createdAt.toISOString(),
        description: `Slot locked for 10 minutes until ${booking.slotLockExpiresAt.toISOString()}`,
      });
    }

    const payment = booking.payments?.[0];
    if (payment) {
      events.push({
        step: 'PAYMENT_' + payment.status,
        timestamp: payment.createdAt.toISOString(),
        description: `Payment ${payment.status} via ${payment.gateway}. Amount: ₹${(payment.amount / 100).toFixed(2)}`,
      });
    }

    if (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.COMPLETED) {
      events.push({
        step: 'BOOKING_CONFIRMED',
        timestamp: booking.updatedAt.toISOString(),
        description: 'Session confirmed and funds held in platform escrow',
      });
    }

    if (booking.session) {
      const joinTime =
        booking.session.startedAt ||
        booking.session.joinedByConsumerAt ||
        booking.session.joinedByProviderAt;
      if (joinTime) {
        events.push({
          step: 'SESSION_JOINED',
          timestamp: joinTime.toISOString(),
          description: `Video room opened: ${booking.session.videoRoomName || 'Session Room'}`,
        });
      }
      if (booking.session.endedAt) {
        events.push({
          step: 'SESSION_CONCLUDED',
          timestamp: booking.session.endedAt.toISOString(),
          description: `Call ended at ${booking.session.endedAt.toISOString()}`,
        });
      }
    }

    if (booking.dispute) {
      events.push({
        step: 'DISPUTE_RAISED',
        timestamp: booking.dispute.createdAt.toISOString(),
        description: `Dispute opened (${booking.dispute.status}): ${booking.dispute.reason}`,
      });
    }

    if (
      booking.status === BookingStatus.CANCELLED_BY_CONSUMER ||
      booking.status === BookingStatus.CANCELLED_BY_PROVIDER ||
      booking.status === BookingStatus.REFUNDED
    ) {
      events.push({
        step: 'BOOKING_' + booking.status,
        timestamp: booking.updatedAt.toISOString(),
        description: `Cancelled/Refunded. Refund amount: ₹${((booking.refundAmount || 0) / 100).toFixed(2)}`,
      });
    }

    if (booking.status === BookingStatus.COMPLETED) {
      events.push({
        step: 'BOOKING_COMPLETED',
        timestamp: booking.updatedAt.toISOString(),
        description: 'Practitioner completed session; escrow eligible for release',
      });
    }

    // Append any recorded admin actions
    for (const log of relatedAuditLogs) {
      events.push({
        step: log.action,
        timestamp: log.createdAt.toISOString(),
        description: log.reason || log.action,
        actor: log.userId || 'ADMIN',
        metadata: log.metadata as Record<string, unknown> | undefined,
      });
    }

    // Sort chronologically
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return { booking, events };
  }

  async manualCancelAndRefund(
    adminUser: AuthenticatedUser,
    bookingId: string,
    dto: AdminBookingCancelRefund,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: true,
        provider: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    if (
      booking.status === BookingStatus.REFUNDED ||
      booking.status === BookingStatus.CANCELLED_BY_CONSUMER ||
      booking.status === BookingStatus.CANCELLED_BY_PROVIDER
    ) {
      throw new BadRequestException(`Booking is already in ${booking.status} state.`);
    }

    const beforeState = {
      status: booking.status,
      refundAmount: booking.refundAmount,
    };

    const refundAmount = dto.refundAmountPaise ?? booking.priceSnapshot;
    const payment = booking.payments?.[0];

    await prisma.$transaction(async (tx) => {
      // 1. Update booking
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.REFUNDED,
          refundAmount,
        },
      });

      // 2. Adjust ledger if payment was captured
      if (payment?.status === 'CAPTURED') {
        await tx.ledgerEntry.createMany({
          data: [
            {
              bookingId,
              accountType: LedgerAccountType.PLATFORM_ESCROW,
              entryType: LedgerEntryType.DEBIT,
              amount: refundAmount,
              currency: 'INR',
              description: `Admin manual refund for booking ${bookingId}: ${dto.reason}`,
            },
            {
              bookingId,
              accountType: LedgerAccountType.REFUND_ESCROW,
              entryType: LedgerEntryType.CREDIT,
              amount: refundAmount,
              currency: 'INR',
              description: `Admin refund credited to seeker: ${dto.reason}`,
            },
          ],
        });
      }

      // 3. Optional reliability strike on provider
      if (dto.penalizeProvider) {
        await tx.providerProfile.update({
          where: { userId: booking.providerId },
          data: {
            reliabilityStrikes: { increment: 1 },
          },
        });
      }
    });

    const afterState = {
      status: BookingStatus.REFUNDED,
      refundAmount,
      penalizeProvider: dto.penalizeProvider,
    };

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_BOOKING_MANUAL_CANCEL_REFUND',
      entityType: 'Booking',
      entityId: bookingId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { refundAmountPaise: refundAmount, providerPenalized: dto.penalizeProvider },
    });

    return {
      success: true,
      message: `Booking cancelled and refunded ₹${(refundAmount / 100).toFixed(2)}`,
    };
  }

  async forceCompleteBooking(
    adminUser: AuthenticatedUser,
    bookingId: string,
    dto: AdminBookingForceComplete,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: true,
        provider: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Booking is already completed.');
    }

    const beforeState = { status: booking.status };

    await prisma.$transaction(async (tx) => {
      // 1. Mark completed
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.COMPLETED },
      });

      // 2. Increment completedSessions on provider profile
      await tx.providerProfile.update({
        where: { userId: booking.providerId },
        data: { completedSessions: { increment: 1 } },
      });

      // 3. Release escrow to provider payable if requested
      if (dto.releaseEscrow && booking.priceSnapshot > 0) {
        const commissionBps = booking.commissionBps || 1500;
        const platformShare = Math.round((booking.priceSnapshot * commissionBps) / 10000);
        const providerShare = booking.priceSnapshot - platformShare;

        await tx.ledgerEntry.createMany({
          data: [
            {
              bookingId,
              accountType: LedgerAccountType.PLATFORM_ESCROW,
              entryType: LedgerEntryType.DEBIT,
              amount: booking.priceSnapshot,
              currency: 'INR',
              description: `Escrow released on admin force-completion for booking ${bookingId}`,
            },
            {
              bookingId,
              accountType: LedgerAccountType.PLATFORM_REVENUE,
              entryType: LedgerEntryType.CREDIT,
              amount: platformShare,
              currency: 'INR',
              description: `Platform commission revenue (${commissionBps / 100}%)`,
            },
            {
              bookingId,
              accountType: LedgerAccountType.PROVIDER_PAYABLE,
              entryType: LedgerEntryType.CREDIT,
              amount: providerShare,
              currency: 'INR',
              description: `Practitioner share credited to payable`,
            },
          ],
        });
      }
    });

    const afterState = { status: BookingStatus.COMPLETED, escrowReleased: dto.releaseEscrow };

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_BOOKING_FORCE_COMPLETED',
      entityType: 'Booking',
      entityId: bookingId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Booking successfully force-completed and escrow released.',
    };
  }
}
