import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { prisma, PayoutStatus } from '@project-nirvana/db';
import { ProviderEarningsResponse } from '@project-nirvana/shared';
import { PAYMENT_GATEWAY, PaymentGateway } from '../interfaces/payment-gateway.interface';
import { LedgerService } from './ledger.service';
import { getEnvConfig } from '../../../config/env.config';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Event listener for booking completed.
   * Calculates platform commission and schedules practitioner payout after configurable hold period.
   */
  @OnEvent('booking.completed')
  async handleBookingCompleted(payload: { bookingId: string }): Promise<void> {
    this.logger.log(`EscrowService: Handling completion for booking ${payload.bookingId}`);
    try {
      await this.scheduleEscrowRelease(payload.bookingId);
    } catch (err: unknown) {
      this.logger.error(`Failed to schedule escrow release for booking ${payload.bookingId}:`, err);
    }
  }

  /**
   * Schedules escrow release and Route payout after dispute hold window.
   */
  async scheduleEscrowRelease(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: true,
        dispute: true,
        provider: {
          include: {
            providerProfile: true,
          },
        },
      },
    });

    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found for escrow release`);
      return;
    }

    if (booking.dispute && booking.dispute.status !== 'RESOLVED_RELEASE') {
      this.logger.warn(`Booking ${bookingId} is in active dispute. Escrow hold maintained.`);
      return;
    }

    const capturedPayment = booking.payments.find((p) => p.status === 'CAPTURED');
    if (!capturedPayment) {
      this.logger.warn(`No captured payment found for booking ${bookingId}`);
      return;
    }

    const providerProfile = booking.provider.providerProfile;
    if (!providerProfile) {
      this.logger.warn(`Provider profile not found for provider user ${booking.providerId}`);
      return;
    }

    // Effective net amount in escrow (original minus any partial refund)
    const netAmountPaise = capturedPayment.amount - (capturedPayment.refundedAmount || 0);
    if (netAmountPaise <= 0) {
      this.logger.log(`Booking ${bookingId} was fully refunded. No escrow to release.`);
      return;
    }

    // Check if payout already created
    const existingPayout = await prisma.payout.findFirst({
      where: {
        providerId: providerProfile.id,
        ledgerEntries: {
          some: { bookingId },
        },
      },
    });

    if (existingPayout) {
      this.logger.log(`Payout already exists for booking ${bookingId}`);
      return;
    }

    const env = getEnvConfig();
    const holdHours = env.HOLD_PERIOD_HOURS;
    const scheduledFor = new Date(Date.now() + holdHours * 3600000);

    await prisma.$transaction(async (tx) => {
      // 1. Double-entry ledger release: Debit PLATFORM_ESCROW, Credit PLATFORM_REVENUE & PROVIDER_PAYABLE
      const { providerSharePaise } = await this.ledgerService.recordEscrowRelease(
        booking.id,
        netAmountPaise,
        booking.commissionBps,
        booking.currency,
        tx,
      );

      // 2. Create pending payout record
      const payout = await tx.payout.create({
        data: {
          providerId: providerProfile.id,
          amount: providerSharePaise,
          currency: booking.currency,
          status: PayoutStatus.PENDING,
          scheduledFor,
        },
      });

      // Link payout to booking in ledger
      await tx.ledgerEntry.updateMany({
        where: { bookingId: booking.id, accountType: 'PROVIDER_PAYABLE' },
        data: { payoutId: payout.id },
      });
    });

    this.logger.log(
      `Escrow scheduled for booking ${bookingId}. Payout unlock at ${scheduledFor.toISOString()}`,
    );
  }

  /**
   * Executes scheduled Route transfers for matured payouts.
   */
  async processDuePayouts(): Promise<number> {
    const duePayouts = await prisma.payout.findMany({
      where: {
        status: PayoutStatus.PENDING,
        scheduledFor: { lte: new Date() },
      },
      include: {
        provider: true,
        ledgerEntries: true,
      },
    });

    this.logger.log(`Processing ${duePayouts.length} due practitioner payouts...`);
    let processedCount = 0;

    for (const payout of duePayouts) {
      try {
        const destinationAccountId = payout.provider.payoutAccountId;
        if (!destinationAccountId) {
          this.logger.warn(
            `Cannot transfer payout ${payout.id}: Provider ${payout.providerId} has no linked account`,
          );
          continue;
        }

        // Execute transfer via payment gateway
        const transfer = await this.gateway.createTransfer({
          paymentId: `pay_payout_${payout.id}`,
          destinationAccountId,
          amountPaise: payout.amount,
          currency: payout.currency,
          notes: { payoutId: payout.id, providerId: payout.providerId },
        });

        await prisma.$transaction(async (tx) => {
          // Update payout record
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.PAID,
              gatewayTransferId: transfer.transferId,
              processedAt: transfer.settledAt || new Date(),
            },
          });

          // Record double-entry payout: Debit PROVIDER_PAYABLE, Credit CONSUMER_PAYMENT
          await this.ledgerService.recordProviderPayout(
            payout.id,
            payout.amount,
            transfer.transferId,
            payout.ledgerEntries[0]?.bookingId || undefined,
            payout.currency,
            tx,
          );
        });

        processedCount++;
      } catch (err: unknown) {
        this.logger.error(`Failed to execute payout ${payout.id}:`, err);
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: PayoutStatus.FAILED },
        });
      }
    }

    return processedCount;
  }

  /**
   * Calculates comprehensive provider earnings dashboard statistics.
   */
  async getProviderEarnings(providerUserId: string): Promise<ProviderEarningsResponse> {
    const providerProfile = await prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
    });

    if (!providerProfile) {
      throw new Error('Provider profile not found');
    }

    const env = getEnvConfig();

    // 1. Fetch all bookings for provider
    const bookings = await prisma.booking.findMany({
      where: { providerId: providerUserId },
      include: {
        payments: true,
        service: true,
        consumer: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Fetch all payouts for provider
    const payouts = await prisma.payout.findMany({
      where: { providerId: providerProfile.id },
      include: { ledgerEntries: true },
    });

    let pendingEscrowPaise = 0;
    let availableForPayoutPaise = 0;
    let paidOutPaise = 0;
    let totalRevenuePaise = 0;
    let totalCommissionPaidPaise = 0;

    const now = Date.now();

    for (const payout of payouts) {
      if (payout.status === PayoutStatus.PAID) {
        paidOutPaise += payout.amount;
      } else if (payout.status === PayoutStatus.PENDING) {
        if (new Date(payout.scheduledFor).getTime() <= now) {
          availableForPayoutPaise += payout.amount;
        } else {
          pendingEscrowPaise += payout.amount;
        }
      }
    }

    const transactions: ProviderEarningsResponse['transactions'] = [];

    for (const b of bookings) {
      const payment = b.payments.find((p) => p.status === 'CAPTURED');
      if (!payment) continue;

      const gross = payment.amount - (payment.refundedAmount || 0);
      const commission = Math.round((gross * b.commissionBps) / 10000);
      const net = gross - commission;

      totalRevenuePaise += gross;
      totalCommissionPaidPaise += commission;

      const payout = payouts.find((p) => p.ledgerEntries.some((le) => le.bookingId === b.id));

      let escrowStatus: ProviderEarningsResponse['transactions'][0]['escrowStatus'] =
        'HELD_IN_ESCROW';
      if (b.status === 'CANCELLED_BY_CONSUMER' || b.status === 'CANCELLED_BY_PROVIDER') {
        escrowStatus = 'REFUNDED';
      } else if (payout) {
        if (payout.status === PayoutStatus.PAID) {
          escrowStatus = 'PAID_OUT';
        } else if (new Date(payout.scheduledFor).getTime() <= now) {
          escrowStatus = 'READY_FOR_PAYOUT';
        } else {
          escrowStatus = 'DISPUTE_HOLD';
        }
      }

      transactions.push({
        bookingId: b.id,
        serviceTitle: b.service.title,
        clientEmail: b.consumer.email,
        sessionDate: b.startAt.toISOString(),
        grossAmountPaise: gross,
        commissionBps: b.commissionBps,
        commissionPaise: commission,
        netProviderPaise: net,
        escrowStatus,
        payoutDate: payout?.processedAt ? payout.processedAt.toISOString() : null,
        transferId: payout?.gatewayTransferId || null,
      });
    }

    return {
      providerId: providerProfile.id,
      currency: 'INR',
      pendingEscrowPaise,
      availableForPayoutPaise,
      paidOutPaise,
      totalRevenuePaise,
      totalCommissionPaidPaise,
      disputeHoldHours: env.HOLD_PERIOD_HOURS,
      reliabilityStrikes: providerProfile.reliabilityStrikes,
      transactions,
    };
  }
}
