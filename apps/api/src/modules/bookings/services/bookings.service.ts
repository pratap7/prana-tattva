import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { DateTime } from 'luxon';
import {
  prisma,
  PrismaClient,
  BookingStatus,
  CancellationPolicy,
  ServiceMode,
} from '@project-nirvana/db';
import {
  CreateBookingDto,
  RescheduleBookingDto,
  PaymentWebhookDto,
  BookingSummaryResponse,
  calculateRefund,
  RefundCalculationResult,
} from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { RedisLockService } from './redis-lock.service';
import { BookingQueueService } from './booking-queue.service';
import { BookingStateMachine } from '../state-machine/booking-state-machine';
import {
  BookingCreatedEvent,
  BookingConfirmedEvent,
  BookingRescheduledEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingNoShowEvent,
  BookingStateChangedEvent,
} from '../events/booking.events';

interface RawBookingModel {
  id: string;
  consumerId: string;
  providerId: string;
  serviceId: string;
  startAt: Date | string;
  endAt: Date | string;
  status: string;
  priceSnapshot: number;
  currency: string;
  commissionBps: number;
  notes?: string | null;
  slotLockExpiresAt?: Date | string | null;
  refundAmount?: number | null;
  refundReason?: string | null;
  cancelledAt?: Date | string | null;
  rescheduledCount?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  service?: {
    id: string;
    title: string;
    durationMin: number;
    mode: string;
    cancellationPolicy: string;
  } | null;
  provider?: {
    providerProfile?: {
      id: string;
      displayName: string;
      slug: string;
      headline: string;
      avatarUrl?: string | null;
      city?: string | null;
      country?: string | null;
      ratingAvg?: unknown;
      ratingCount?: number | null;
    } | null;
  } | null;
  consumer?: {
    id: string;
    email?: string | null;
  } | null;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly prisma: PrismaClient;

  constructor(
    private readonly redisLockService: RedisLockService,
    private readonly queueService: BookingQueueService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() @Inject('PRISMA_CLIENT') prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient || prisma;
  }

  @OnEvent('booking.internal.lock_expired', { async: true })
  async handleQueueLockExpired(payload: { bookingId: string }): Promise<void> {
    await this.handleLockExpiry(payload.bookingId);
  }

  @OnEvent('booking.internal.session_completed', { async: true })
  async handleQueueSessionCompleted(payload: { bookingId: string }): Promise<void> {
    await this.handleSessionCompletion(payload.bookingId);
  }

  /**
   * Step 1: Create a booking in PENDING_PAYMENT with a 10-minute slot lock
   * Guaranteed concurrency-safe via Redis distributed lock + PostgreSQL DB exclusion check
   */
  async createBooking(consumerId: string, dto: CreateBookingDto): Promise<BookingSummaryResponse> {
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      include: {
        category: true,
        provider: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!service || !service.isActive) {
      throw new NotFoundException({
        code: 'SERVICE_NOT_FOUND',
        message: 'The requested service was not found or is no longer active.',
      });
    }

    const provider = service.provider;
    if (provider.userId === consumerId) {
      throw new BadRequestException({
        code: 'CANNOT_BOOK_OWN_SERVICE',
        message: 'Practitioners cannot book their own services.',
      });
    }

    const startAtUtc = DateTime.fromISO(dto.startAt, { zone: 'utc' });
    if (!startAtUtc.isValid) {
      throw new BadRequestException({
        code: 'INVALID_START_TIME',
        message: 'startAt must be a valid ISO 8601 UTC date-time string.',
      });
    }

    const nowUtc = DateTime.utc();
    const minNoticeHours = provider.minNoticeHours || 4;
    if (startAtUtc < nowUtc.plus({ hours: minNoticeHours })) {
      throw new BadRequestException({
        code: 'NOTICE_WINDOW_VIOLATION',
        message: `Bookings require at least ${minNoticeHours} hours advance notice.`,
      });
    }

    const endAtUtc = startAtUtc.plus({ minutes: service.durationMin });
    const startAtDate = startAtUtc.toJSDate();
    const endAtDate = endAtUtc.toJSDate();

    // 1. Acquire Distributed Redis Slot Lock (10 minutes = 600 seconds)
    const lockToken = await this.redisLockService.acquireSlotLock(
      provider.userId,
      dto.startAt,
      600,
    );

    if (!lockToken) {
      throw new ConflictException({
        code: 'SLOT_TEMPORARILY_LOCKED',
        message: 'This slot is currently being booked by another client. Please try another slot.',
      });
    }

    const slotLockExpiresAt = nowUtc.plus({ minutes: 10 }).toJSDate();

    try {
      // 2. PostgreSQL Atomic Transaction + DB Overlap / Exclusion Check
      const booking = await this.prisma.$transaction(async (tx) => {
        // Check for any active overlapping bookings for this provider
        const overlappingBookings = await tx.booking.findMany({
          where: {
            providerId: provider.userId,
            status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
            AND: [{ startAt: { lt: endAtDate } }, { endAt: { gt: startAtDate } }],
          },
        });

        for (const existing of overlappingBookings) {
          if (existing.status === 'CONFIRMED') {
            throw new ConflictException({
              code: 'SLOT_ALREADY_BOOKED',
              message: 'This slot has already been confirmed and booked.',
            });
          }

          if (existing.status === 'PENDING_PAYMENT') {
            const isLockValid =
              existing.slotLockExpiresAt &&
              DateTime.fromJSDate(existing.slotLockExpiresAt) > nowUtc;

            if (isLockValid) {
              throw new ConflictException({
                code: 'SLOT_RESERVED',
                message: 'This slot is currently reserved by another client.',
              });
            }

            // Stale expired lock: auto-expire it to free up the exclusion constraint
            await tx.booking.update({
              where: { id: existing.id },
              data: {
                status: 'CANCELLED_BY_CONSUMER',
                refundReason: 'Reservation lock expired',
                slotLockExpiresAt: null,
              },
            });
          }
        }

        // Create the booking with 10-minute slot lock
        return tx.booking.create({
          data: {
            consumerId,
            providerId: provider.userId,
            serviceId: service.id,
            startAt: startAtDate,
            endAt: endAtDate,
            status: 'PENDING_PAYMENT',
            priceSnapshot: service.priceAmount,
            currency: service.currency,
            commissionBps: service.category.commissionBps,
            notes: dto.notes ?? null,
            slotLockExpiresAt,
          },
          include: {
            service: true,
            provider: {
              include: {
                providerProfile: true,
              },
            },
            consumer: true,
          },
        });
      });

      // 3. Schedule BullMQ delayed job for 10-minute slot lock expiry
      await this.queueService.scheduleSlotLockExpiry(booking.id, 10 * 60 * 1000);

      // 4. Emit Domain Events & Write Audit Log
      this.eventEmitter.emit(
        BookingCreatedEvent.EVENT_NAME,
        new BookingCreatedEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          booking.startAt.toISOString(),
          booking.endAt.toISOString(),
          booking.priceSnapshot,
          slotLockExpiresAt.toISOString(),
        ),
      );

      this.eventEmitter.emit(
        BookingStateChangedEvent.EVENT_NAME,
        new BookingStateChangedEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          'PENDING_PAYMENT',
          'PENDING_PAYMENT',
          'PAYMENT_SUCCESS', // initial state
          consumerId,
          { slotLockExpiresAt: slotLockExpiresAt.toISOString() },
        ),
      );

      await this.auditService.record({
        userId: consumerId,
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: booking.id,
        metadata: {
          serviceId: service.id,
          providerId: provider.userId,
          slotLockExpiresAt: slotLockExpiresAt.toISOString(),
          pricePaise: booking.priceSnapshot,
        },
      });

      return this.mapToBookingSummary(booking);
    } catch (err: unknown) {
      // Release Redis lock on failure
      await this.redisLockService.releaseSlotLock(provider.userId, dto.startAt, lockToken);

      // Handle PostgreSQL GiST exclusion constraint error (code 23P01)
      const errorStr = String(err);
      if (
        errorStr.includes('23P01') ||
        errorStr.includes('exclusion_violation') ||
        errorStr.includes('no_overlapping_provider_bookings')
      ) {
        throw new ConflictException({
          code: 'SLOT_EXCLUSION_CONFLICT',
          message: 'Concurrency conflict: this slot was locked simultaneously by another client.',
        });
      }

      throw err;
    }
  }

  /**
   * Step 2: Payment Webhook Handler (Idempotent)
   * Payment succeeds -> CONFIRMED. Lock expiry / failure -> CANCELLED & slot released.
   */
  async handlePaymentWebhook(
    dto: PaymentWebhookDto,
  ): Promise<{ status: BookingStatus; alreadyProcessed: boolean }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        service: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
        consumer: true,
        payments: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${dto.bookingId} not found.`,
      });
    }

    // Idempotency: If booking is already CONFIRMED, return safely without error
    if (booking.status === 'CONFIRMED') {
      this.logger.log(`Idempotent webhook: Booking ${dto.bookingId} is already CONFIRMED.`);
      return { status: 'CONFIRMED', alreadyProcessed: true };
    }

    if (dto.status === 'failed') {
      const nextState = BookingStateMachine.getNextState(
        booking.status,
        'PAYMENT_FAILED',
        booking.id,
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: nextState,
            refundReason: 'Payment attempt failed',
            slotLockExpiresAt: null,
          },
        });

        await tx.payment.create({
          data: {
            bookingId: booking.id,
            gatewayPaymentId: dto.paymentId,
            gatewayOrderId: dto.orderId ?? null,
            amount: dto.amount ?? booking.priceSnapshot,
            status: 'FAILED',
          },
        });
      });

      await this.queueService.cancelSlotLockExpiry(booking.id);

      this.eventEmitter.emit(
        BookingStateChangedEvent.EVENT_NAME,
        new BookingStateChangedEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          booking.status as BookingStatus,
          nextState,
          'PAYMENT_FAILED',
        ),
      );

      await this.auditService.record({
        userId: booking.consumerId,
        action: 'BOOKING_PAYMENT_FAILED',
        entityType: 'Booking',
        entityId: booking.id,
        metadata: { paymentId: dto.paymentId, event: dto.event },
      });

      return { status: nextState, alreadyProcessed: false };
    }

    // Payment Succeeded -> CONFIRMED
    const nextState = BookingStateMachine.getNextState(
      booking.status,
      'PAYMENT_SUCCESS',
      booking.id,
    );

    await this.prisma.$transaction(async (tx) => {
      // Update booking to CONFIRMED and clear slot lock
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: nextState,
          slotLockExpiresAt: null,
        },
      });

      // Record captured payment
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          gatewayPaymentId: dto.paymentId,
          gatewayOrderId: dto.orderId ?? null,
          amount: dto.amount ?? booking.priceSnapshot,
          status: 'CAPTURED',
        },
      });

      // Initialize session record with Daily.co video room name (derived from random ID, NOT booking ID)
      const randomRoomName = `nirvana-${crypto.randomBytes(8).toString('hex')}`;
      await tx.session.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          videoRoomName: randomRoomName,
        },
        update: {},
      });
    });

    // Cancel slot lock expiration job since booking is now paid
    await this.queueService.cancelSlotLockExpiry(booking.id);

    // Schedule session completion check job after session endAt
    const msUntilSessionEnd = Math.max(0, new Date(booking.endAt).getTime() - Date.now());
    await this.queueService.scheduleSessionCompletion(booking.id, msUntilSessionEnd + 60000); // 1 min buffer

    // Emit Domain Events
    this.eventEmitter.emit(
      BookingConfirmedEvent.EVENT_NAME,
      new BookingConfirmedEvent(
        booking.id,
        booking.consumerId,
        booking.providerId,
        booking.serviceId,
        dto.paymentId,
        booking.startAt.toISOString(),
        booking.endAt.toISOString(),
        booking.priceSnapshot,
      ),
    );

    this.eventEmitter.emit(
      BookingStateChangedEvent.EVENT_NAME,
      new BookingStateChangedEvent(
        booking.id,
        booking.consumerId,
        booking.providerId,
        booking.serviceId,
        booking.status as BookingStatus,
        nextState,
        'PAYMENT_SUCCESS',
        booking.consumerId,
        { paymentId: dto.paymentId },
      ),
    );

    await this.auditService.record({
      userId: booking.consumerId,
      action: 'BOOKING_CONFIRMED',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: {
        paymentId: dto.paymentId,
        pricePaise: booking.priceSnapshot,
      },
    });

    return { status: nextState, alreadyProcessed: false };
  }

  /**
   * Step 3: Reschedule Booking
   * Allowed per cancellation policy, re-validates availability, preserves payment.
   */
  async rescheduleBooking(
    bookingId: string,
    actorUserId: string,
    dto: RescheduleBookingDto,
  ): Promise<BookingSummaryResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
        consumer: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${bookingId} not found.`,
      });
    }

    if (booking.consumerId !== actorUserId && booking.providerId !== actorUserId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESCHEDULE',
        message: 'Only the client or practitioner can reschedule this appointment.',
      });
    }

    // Verify current state supports reschedule
    BookingStateMachine.getNextState(booking.status as BookingStatus, 'RESCHEDULE', booking.id);

    const nowUtc = DateTime.utc();
    const currentStartAt = DateTime.fromJSDate(booking.startAt);
    const hoursBefore = currentStartAt.diff(nowUtc, 'hours').hours;

    // Check cancellation policy window for rescheduling
    const policy = booking.service.cancellationPolicy as CancellationPolicy;
    if (policy === 'STRICT' && hoursBefore < 48) {
      throw new BadRequestException({
        code: 'RESCHEDULE_WINDOW_CLOSED',
        message: 'STRICT policy: Sessions cannot be rescheduled within 48 hours of start time.',
      });
    }
    if (policy === 'FLEXIBLE' && hoursBefore < 2) {
      throw new BadRequestException({
        code: 'RESCHEDULE_WINDOW_CLOSED',
        message: 'Sessions cannot be rescheduled within 2 hours of scheduled start.',
      });
    }

    // Validate new start slot
    const newStartAtUtc = DateTime.fromISO(dto.newStartAt, { zone: 'utc' });
    if (!newStartAtUtc.isValid) {
      throw new BadRequestException({
        code: 'INVALID_NEW_START_TIME',
        message: 'newStartAt must be a valid ISO 8601 UTC date-time string.',
      });
    }

    const minNoticeHours = booking.provider.providerProfile?.minNoticeHours || 4;
    if (newStartAtUtc < nowUtc.plus({ hours: minNoticeHours })) {
      throw new BadRequestException({
        code: 'NOTICE_WINDOW_VIOLATION',
        message: `Rescheduled slots require at least ${minNoticeHours} hours advance notice.`,
      });
    }

    const newEndAtUtc = newStartAtUtc.plus({ minutes: booking.service.durationMin });
    const newStartDate = newStartAtUtc.toJSDate();
    const newEndDate = newEndAtUtc.toJSDate();

    // Acquire lock on new slot
    const lockToken = await this.redisLockService.acquireSlotLock(
      booking.providerId,
      dto.newStartAt,
      30, // Short 30s critical section lock for atomic swap
    );

    if (!lockToken) {
      throw new ConflictException({
        code: 'NEW_SLOT_UNAVAILABLE',
        message: 'The requested new slot is currently being locked or booked by someone else.',
      });
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Check for conflicts on new slot (excluding current booking)
        const conflict = await tx.booking.findFirst({
          where: {
            id: { not: booking.id },
            providerId: booking.providerId,
            status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
            AND: [{ startAt: { lt: newEndDate } }, { endAt: { gt: newStartDate } }],
          },
        });

        if (conflict) {
          throw new ConflictException({
            code: 'NEW_SLOT_CONFLICT',
            message: 'The requested new slot has already been booked.',
          });
        }

        return tx.booking.update({
          where: { id: booking.id },
          data: {
            startAt: newStartDate,
            endAt: newEndDate,
            rescheduledCount: { increment: 1 },
          },
          include: {
            service: true,
            provider: {
              include: {
                providerProfile: true,
              },
            },
            consumer: true,
          },
        });
      });

      // Emit Rescheduled Event & Audit Log
      this.eventEmitter.emit(
        BookingRescheduledEvent.EVENT_NAME,
        new BookingRescheduledEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          booking.startAt.toISOString(),
          booking.endAt.toISOString(),
          newStartDate.toISOString(),
          newEndDate.toISOString(),
          updated.rescheduledCount,
          dto.reason,
        ),
      );

      await this.auditService.record({
        userId: actorUserId,
        action: 'BOOKING_RESCHEDULED',
        entityType: 'Booking',
        entityId: booking.id,
        metadata: {
          previousStartAt: booking.startAt.toISOString(),
          newStartAt: newStartDate.toISOString(),
          reason: dto.reason,
        },
      });

      return this.mapToBookingSummary(updated);
    } finally {
      await this.redisLockService.releaseSlotLock(booking.providerId, dto.newStartAt, lockToken);
    }
  }

  /**
   * Step 4: Cancel Booking
   * Refund amount computed by cancellation policy. Provider cancellation always refunds 100% + records a strike.
   */
  async cancelBooking(
    bookingId: string,
    actorUserId: string,
    reason: string,
  ): Promise<{ booking: BookingSummaryResponse; refund: RefundCalculationResult }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
        consumer: true,
        payments: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${bookingId} not found.`,
      });
    }

    const isConsumer = booking.consumerId === actorUserId;
    const isProvider = booking.providerId === actorUserId;

    if (!isConsumer && !isProvider) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_CANCELLATION',
        message: 'Only the client or practitioner can cancel this appointment.',
      });
    }

    const cancelledBy = isProvider ? 'PROVIDER' : 'CONSUMER';
    const event = cancelledBy === 'PROVIDER' ? 'CANCEL_BY_PROVIDER' : 'CANCEL_BY_CONSUMER';
    const nextState = BookingStateMachine.getNextState(
      booking.status as BookingStatus,
      event,
      booking.id,
    );

    // Compute refund amount strictly according to policy
    const nowUtc = DateTime.utc();
    const startAtUtc = DateTime.fromJSDate(booking.startAt);
    const hoursBefore = startAtUtc.diff(nowUtc, 'hours').hours;

    const policy = booking.service.cancellationPolicy as CancellationPolicy;
    const refund = calculateRefund(policy, booking.priceSnapshot, hoursBefore, cancelledBy);

    await this.prisma.$transaction(async (tx) => {
      // Update booking status
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: nextState,
          refundAmount: refund.refundPaise,
          refundReason: reason,
          cancelledAt: new Date(),
          slotLockExpiresAt: null,
        },
      });

      // Provider cancellation records a reliability strike
      if (cancelledBy === 'PROVIDER') {
        await tx.providerProfile.update({
          where: { userId: booking.providerId },
          data: {
            reliabilityStrikes: { increment: 1 },
          },
        });
      }

      // If a captured payment exists and refund applies, update payment refunded amount
      if (refund.refundPaise > 0 && booking.payments.length > 0) {
        const capturedPayment = booking.payments.find((p) => p.status === 'CAPTURED');
        if (capturedPayment) {
          await tx.payment.update({
            where: { id: capturedPayment.id },
            data: {
              refundedAmount: refund.refundPaise,
              status: refund.refundPercentage === 100 ? 'REFUNDED' : 'CAPTURED',
            },
          });
        }
      }
    });

    // Cancel BullMQ scheduled jobs
    await this.queueService.cancelSlotLockExpiry(booking.id);

    // Emit Events & Audit Log
    this.eventEmitter.emit(
      BookingCancelledEvent.EVENT_NAME,
      new BookingCancelledEvent(
        booking.id,
        booking.consumerId,
        booking.providerId,
        booking.serviceId,
        cancelledBy,
        policy,
        refund.refundPaise,
        refund.refundPercentage,
        reason,
        cancelledBy === 'PROVIDER',
      ),
    );

    this.eventEmitter.emit(
      BookingStateChangedEvent.EVENT_NAME,
      new BookingStateChangedEvent(
        booking.id,
        booking.consumerId,
        booking.providerId,
        booking.serviceId,
        booking.status as BookingStatus,
        nextState,
        event,
        actorUserId,
        {
          refundPaise: refund.refundPaise,
          refundPercentage: refund.refundPercentage,
          strikeRecorded: cancelledBy === 'PROVIDER',
        },
      ),
    );

    await this.auditService.record({
      userId: actorUserId,
      action:
        cancelledBy === 'PROVIDER'
          ? 'BOOKING_CANCELLED_BY_PROVIDER'
          : 'BOOKING_CANCELLED_BY_CONSUMER',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: {
        reason,
        refundPaise: refund.refundPaise,
        refundPercentage: refund.refundPercentage,
        hoursBeforeSession: hoursBefore,
        strikeRecorded: cancelledBy === 'PROVIDER',
      },
    });

    const updatedBooking = await this.getBooking(booking.id, actorUserId);
    return { booking: updatedBooking, refund };
  }

  /**
   * BullMQ Worker Handler: Lock Expiry (10 minutes elapsed without payment)
   */
  async handleLockExpiry(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking || booking.status !== 'PENDING_PAYMENT') {
      return;
    }

    const nextState = BookingStateMachine.getNextState(booking.status, 'LOCK_EXPIRED', booking.id);

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: nextState,
        refundReason: 'Slot reservation lock expired (10 minutes elapsed without payment)',
        slotLockExpiresAt: null,
      },
    });

    this.eventEmitter.emit(
      BookingCancelledEvent.EVENT_NAME,
      new BookingCancelledEvent(
        booking.id,
        booking.consumerId,
        booking.providerId,
        booking.serviceId,
        'CONSUMER',
        'FLEXIBLE',
        0,
        0,
        'Slot reservation lock expired',
        false,
      ),
    );

    this.eventEmitter.emit(
      BookingStateChangedEvent.EVENT_NAME,
      new BookingStateChangedEvent(
        booking.id,
        booking.consumerId,
        booking.providerId,
        booking.serviceId,
        booking.status,
        nextState,
        'LOCK_EXPIRED',
      ),
    );

    await this.auditService.record({
      userId: booking.consumerId,
      action: 'BOOKING_LOCK_EXPIRED',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: { reason: 'Slot reservation lock expired' },
    });

    this.logger.log(`Slot lock expired and booking ${bookingId} cancelled automatically.`);
  }

  /**
   * Step 5: BullMQ Worker Handler: Session Completion and No-Show Rules
   */
  async handleSessionCompletion(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        session: true,
      },
    });

    if (!booking || booking.status !== 'CONFIRMED') {
      return;
    }

    const session = booking.session;
    const consumerAttended = !!session?.joinedByConsumerAt;
    const providerAttended = !!session?.joinedByProviderAt;

    if (consumerAttended && providerAttended) {
      // Both attended -> COMPLETED
      const nextState = BookingStateMachine.getNextState(
        booking.status,
        'SESSION_ATTENDED',
        booking.id,
      );

      await this.prisma.$transaction([
        this.prisma.booking.update({
          where: { id: booking.id },
          data: { status: nextState },
        }),
        this.prisma.providerProfile.update({
          where: { userId: booking.providerId },
          data: { completedSessions: { increment: 1 } },
        }),
      ]);

      this.eventEmitter.emit(
        BookingCompletedEvent.EVENT_NAME,
        new BookingCompletedEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          true,
        ),
      );

      this.eventEmitter.emit(
        BookingStateChangedEvent.EVENT_NAME,
        new BookingStateChangedEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          booking.status,
          nextState,
          'SESSION_ATTENDED',
        ),
      );

      await this.auditService.record({
        action: 'BOOKING_COMPLETED',
        entityType: 'Booking',
        entityId: booking.id,
        metadata: { attendance: 'BOTH' },
      });
    } else if (consumerAttended && !providerAttended) {
      // Provider No-Show -> 100% refund to consumer + reliability strike
      const nextState = BookingStateMachine.getNextState(
        booking.status,
        'PROVIDER_NO_SHOW',
        booking.id,
      );

      await this.prisma.$transaction([
        this.prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: nextState,
            refundAmount: booking.priceSnapshot,
            refundReason: 'Practitioner did not attend session (Provider No-Show)',
          },
        }),
        this.prisma.providerProfile.update({
          where: { userId: booking.providerId },
          data: { reliabilityStrikes: { increment: 1 } },
        }),
      ]);

      this.eventEmitter.emit(
        BookingNoShowEvent.EVENT_NAME,
        new BookingNoShowEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          'PROVIDER',
        ),
      );

      await this.auditService.record({
        action: 'BOOKING_PROVIDER_NO_SHOW',
        entityType: 'Booking',
        entityId: booking.id,
        metadata: { defaultingParty: 'PROVIDER' },
      });
    } else if (!consumerAttended && providerAttended) {
      // Consumer No-Show -> Escrow released to provider, no refund
      const nextState = BookingStateMachine.getNextState(
        booking.status,
        'CONSUMER_NO_SHOW',
        booking.id,
      );

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: nextState,
          refundReason: 'Client did not attend session (Consumer No-Show)',
        },
      });

      this.eventEmitter.emit(
        BookingNoShowEvent.EVENT_NAME,
        new BookingNoShowEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          'CONSUMER',
        ),
      );

      await this.auditService.record({
        action: 'BOOKING_CONSUMER_NO_SHOW',
        entityType: 'Booking',
        entityId: booking.id,
        metadata: { defaultingParty: 'CONSUMER' },
      });
    } else {
      // Neither party logged attendance
      const nextState = BookingStateMachine.getNextState(
        booking.status,
        'SESSION_ATTENDED',
        booking.id,
      );
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: nextState },
      });

      this.eventEmitter.emit(
        BookingCompletedEvent.EVENT_NAME,
        new BookingCompletedEvent(
          booking.id,
          booking.consumerId,
          booking.providerId,
          booking.serviceId,
          false,
        ),
      );
    }
  }

  /**
   * Record Attendance timestamp for a session
   */
  async recordAttendance(
    bookingId: string,
    party: 'CONSUMER' | 'PROVIDER' | 'BOTH',
    joinedAt: Date = new Date(),
  ): Promise<void> {
    const updateData: { joinedByConsumerAt?: Date; joinedByProviderAt?: Date } = {};
    if (party === 'CONSUMER' || party === 'BOTH') updateData.joinedByConsumerAt = joinedAt;
    if (party === 'PROVIDER' || party === 'BOTH') updateData.joinedByProviderAt = joinedAt;

    await this.prisma.session.upsert({
      where: { bookingId },
      create: {
        bookingId,
        videoRoomName: `nirvana-session-${bookingId.slice(0, 8)}`,
        ...updateData,
      },
      update: updateData,
    });
  }

  /**
   * Read single booking with full relations and remaining lock countdown
   */
  async getBooking(bookingId: string, actorUserId: string): Promise<BookingSummaryResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
        consumer: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${bookingId} not found.`,
      });
    }

    if (booking.consumerId !== actorUserId && booking.providerId !== actorUserId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_BOOKING_ACCESS',
        message: 'You are not authorized to view this booking.',
      });
    }

    return this.mapToBookingSummary(booking);
  }

  /**
   * List bookings for Consumer ("My Bookings")
   */
  async listConsumerBookings(
    consumerId: string,
    filter?: 'upcoming' | 'past',
  ): Promise<BookingSummaryResponse[]> {
    const now = new Date();
    const where: {
      consumerId: string;
      startAt?: { gte: Date } | { lt: Date };
      status?: { in: BookingStatus[] };
      OR?: Array<{ startAt?: { lt: Date }; status?: { in: BookingStatus[] } }>;
    } = { consumerId };

    if (filter === 'upcoming') {
      where.startAt = { gte: now };
      where.status = { in: ['PENDING_PAYMENT', 'CONFIRMED'] };
    } else if (filter === 'past') {
      where.OR = [
        { startAt: { lt: now } },
        {
          status: {
            in: [
              'COMPLETED',
              'CANCELLED_BY_CONSUMER',
              'CANCELLED_BY_PROVIDER',
              'REFUNDED',
              'NO_SHOW_CONSUMER',
              'NO_SHOW_PROVIDER',
            ],
          },
        },
      ];
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      orderBy: { startAt: filter === 'upcoming' ? 'asc' : 'desc' },
      include: {
        service: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
        consumer: true,
      },
    });

    return bookings.map((b) => this.mapToBookingSummary(b));
  }

  /**
   * List bookings for Provider ("Calendar / Requests")
   */
  async listProviderBookings(
    providerUserId: string,
    filter?: 'upcoming' | 'past',
  ): Promise<BookingSummaryResponse[]> {
    const now = new Date();
    const where: {
      providerId: string;
      startAt?: { gte: Date } | { lt: Date };
      status?: { in: BookingStatus[] };
      OR?: Array<{ startAt?: { lt: Date }; status?: { in: BookingStatus[] } }>;
    } = { providerId: providerUserId };

    if (filter === 'upcoming') {
      where.startAt = { gte: now };
      where.status = { in: ['CONFIRMED', 'PENDING_PAYMENT'] };
    } else if (filter === 'past') {
      where.OR = [
        { startAt: { lt: now } },
        {
          status: {
            in: [
              'COMPLETED',
              'CANCELLED_BY_CONSUMER',
              'CANCELLED_BY_PROVIDER',
              'REFUNDED',
              'NO_SHOW_CONSUMER',
              'NO_SHOW_PROVIDER',
            ],
          },
        },
      ];
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      orderBy: { startAt: filter === 'upcoming' ? 'asc' : 'desc' },
      include: {
        service: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
        consumer: true,
      },
    });

    return bookings.map((b) => this.mapToBookingSummary(b));
  }

  /**
   * Helper: Map Prisma Booking model to BookingSummaryResponse
   */
  private mapToBookingSummary(b: RawBookingModel): BookingSummaryResponse {
    const now = Date.now();
    let lockRemainingSeconds = 0;

    if (b.status === 'PENDING_PAYMENT' && b.slotLockExpiresAt) {
      const expiresMs = new Date(b.slotLockExpiresAt).getTime();
      lockRemainingSeconds = Math.max(0, Math.floor((expiresMs - now) / 1000));
    }

    const providerProfile = b.provider?.providerProfile;

    return {
      id: b.id,
      consumerId: b.consumerId,
      providerId: b.providerId,
      serviceId: b.serviceId,
      startAt: b.startAt instanceof Date ? b.startAt.toISOString() : b.startAt,
      endAt: b.endAt instanceof Date ? b.endAt.toISOString() : b.endAt,
      status: b.status as BookingStatus,
      priceSnapshot: b.priceSnapshot,
      priceSnapshotRupees: Math.round(b.priceSnapshot / 100),
      currency: b.currency,
      commissionBps: b.commissionBps,
      notes: b.notes,
      slotLockExpiresAt: b.slotLockExpiresAt ? new Date(b.slotLockExpiresAt).toISOString() : null,
      lockRemainingSeconds,
      refundAmount: b.refundAmount,
      refundReason: b.refundReason,
      cancelledAt: b.cancelledAt ? new Date(b.cancelledAt).toISOString() : null,
      rescheduledCount: b.rescheduledCount || 0,
      cancellationPolicy: b.service?.cancellationPolicy as CancellationPolicy,
      service: {
        id: b.service?.id || b.serviceId,
        title: b.service?.title || '',
        durationMin: b.service?.durationMin || 60,
        mode: (b.service?.mode || 'ONLINE') as ServiceMode,
        cancellationPolicy: (b.service?.cancellationPolicy || 'MODERATE') as CancellationPolicy,
      },
      provider: {
        id: providerProfile?.id || b.providerId,
        userId: b.providerId,
        displayName: providerProfile?.displayName || 'Practitioner',
        slug: providerProfile?.slug || '',
        headline: providerProfile?.headline || '',
        avatarUrl: providerProfile?.avatarUrl || null,
        city: providerProfile?.city || '',
        country: providerProfile?.country || 'IN',
        ratingAvg: Number(providerProfile?.ratingAvg || 0),
        ratingCount: Number(providerProfile?.ratingCount || 0),
      },
      consumer: b.consumer
        ? {
            id: b.consumer.id,
            displayName: b.consumer.email?.split('@')[0] || 'Client',
            email: b.consumer.email || '',
          }
        : undefined,
      locationDetails:
        (b.service?.mode || 'ONLINE') === 'IN_PERSON'
          ? (() => {
              const svc = b.service as
                | {
                    locationAddress?: string | null;
                    locationCity?: string | null;
                    locationInstructions?: string | null;
                    locationCoordinates?: { lat: number; lng: number } | null;
                  }
                | undefined;
              const isUnlocked = b.status === 'CONFIRMED' || b.status === 'COMPLETED';
              return {
                address: isUnlocked
                  ? svc?.locationAddress || 'Sanctuary Address Provided'
                  : 'Exact address unlocked upon booking confirmation',
                city: svc?.locationCity || providerProfile?.city || 'Rishikesh',
                instructions: isUnlocked ? svc?.locationInstructions || null : null,
                coordinates: isUnlocked ? svc?.locationCoordinates || null : null,
                isMasked: !isUnlocked,
              };
            })()
          : null,
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
      updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
    };
  }
}
