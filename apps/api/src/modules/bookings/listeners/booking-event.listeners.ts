import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { prisma, LedgerEntryType, LedgerAccountType } from '@project-nirvana/db';
import { NotificationService } from '../../notification/notification.service';
import {
  BookingCreatedEvent,
  BookingConfirmedEvent,
  BookingRescheduledEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingNoShowEvent,
  BookingStateChangedEvent,
} from '../events/booking.events';

@Injectable()
export class BookingNotificationListener {
  private readonly logger = new Logger(BookingNotificationListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(BookingCreatedEvent.EVENT_NAME, { async: true })
  async handleBookingCreated(event: BookingCreatedEvent): Promise<void> {
    try {
      await this.notificationService.send({
        userId: event.consumerId,
        type: 'BOOKING_PENDING_PAYMENT',
        title: 'Complete your booking checkout',
        body: 'Your appointment slot is reserved for 10 minutes. Please complete payment to confirm.',
        data: { bookingId: event.bookingId, slotLockExpiresAt: event.slotLockExpiresAt },
      });
    } catch (err) {
      this.logger.error(`Error notifying booking created for ${event.bookingId}:`, err);
    }
  }

  @OnEvent(BookingConfirmedEvent.EVENT_NAME, { async: true })
  async handleBookingConfirmed(event: BookingConfirmedEvent): Promise<void> {
    try {
      await Promise.all([
        this.notificationService.send({
          userId: event.consumerId,
          type: 'BOOKING_CONFIRMED',
          title: 'Booking Confirmed!',
          body: `Your wellness session scheduled for ${new Date(event.startAt).toLocaleString()} is confirmed.`,
          data: { bookingId: event.bookingId, startAt: event.startAt },
        }),
        this.notificationService.send({
          userId: event.providerId,
          type: 'NEW_BOOKING_SCHEDULED',
          title: 'New Client Appointment',
          body: `You have a new session confirmed for ${new Date(event.startAt).toLocaleString()}.`,
          data: { bookingId: event.bookingId, startAt: event.startAt },
        }),
      ]);
    } catch (err) {
      this.logger.error(`Error notifying booking confirmed for ${event.bookingId}:`, err);
    }
  }

  @OnEvent(BookingRescheduledEvent.EVENT_NAME, { async: true })
  async handleBookingRescheduled(event: BookingRescheduledEvent): Promise<void> {
    try {
      await Promise.all([
        this.notificationService.send({
          userId: event.consumerId,
          type: 'BOOKING_RESCHEDULED',
          title: 'Session Rescheduled',
          body: `Your session has been rescheduled to ${new Date(event.newStartAt).toLocaleString()}.`,
          data: { bookingId: event.bookingId, newStartAt: event.newStartAt },
        }),
        this.notificationService.send({
          userId: event.providerId,
          type: 'BOOKING_RESCHEDULED_PROVIDER',
          title: 'Client Rescheduled Appointment',
          body: `Appointment rescheduled to ${new Date(event.newStartAt).toLocaleString()}.`,
          data: { bookingId: event.bookingId, newStartAt: event.newStartAt },
        }),
      ]);
    } catch (err) {
      this.logger.error(`Error notifying booking rescheduled for ${event.bookingId}:`, err);
    }
  }

  @OnEvent(BookingCancelledEvent.EVENT_NAME, { async: true })
  async handleBookingCancelled(event: BookingCancelledEvent): Promise<void> {
    try {
      const refundNotice =
        event.refundAmountPaise > 0
          ? ` A refund of ₹${Math.round(event.refundAmountPaise / 100)} (${event.refundPercentage}%) has been issued.`
          : ' This session is non-refundable per policy.';

      await Promise.all([
        this.notificationService.send({
          userId: event.consumerId,
          type: 'BOOKING_CANCELLED',
          title: 'Booking Cancelled',
          body: `Booking has been cancelled.${refundNotice}`,
          data: { bookingId: event.bookingId, refundAmountPaise: event.refundAmountPaise },
        }),
        this.notificationService.send({
          userId: event.providerId,
          type: 'BOOKING_CANCELLED_PROVIDER',
          title: 'Booking Cancelled',
          body: `The appointment for ${event.bookingId} has been cancelled.${event.strikeRecorded ? ' A reliability strike has been recorded.' : ''}`,
          data: { bookingId: event.bookingId, strikeRecorded: event.strikeRecorded },
        }),
      ]);
    } catch (err) {
      this.logger.error(`Error notifying booking cancelled for ${event.bookingId}:`, err);
    }
  }

  @OnEvent(BookingCompletedEvent.EVENT_NAME, { async: true })
  async handleBookingCompleted(event: BookingCompletedEvent): Promise<void> {
    try {
      await this.notificationService.send({
        userId: event.consumerId,
        type: 'SESSION_COMPLETED_REVIEW_REQUEST',
        title: 'How was your session?',
        body: 'Your wellness session has concluded. Please take a moment to leave a review.',
        data: { bookingId: event.bookingId },
      });
    } catch (err) {
      this.logger.error(`Error notifying booking completed for ${event.bookingId}:`, err);
    }
  }

  @OnEvent(BookingNoShowEvent.EVENT_NAME, { async: true })
  async handleBookingNoShow(event: BookingNoShowEvent): Promise<void> {
    try {
      await this.notificationService.send({
        userId: event.defaultingParty === 'CONSUMER' ? event.consumerId : event.providerId,
        type: 'SESSION_NO_SHOW',
        title: 'Missed Session',
        body: 'A missed session was recorded for your scheduled appointment.',
        data: { bookingId: event.bookingId, defaultingParty: event.defaultingParty },
      });
    } catch (err) {
      this.logger.error(`Error notifying no show for ${event.bookingId}:`, err);
    }
  }
}

@Injectable()
export class BookingLedgerListener {
  private readonly logger = new Logger(BookingLedgerListener.name);

  @OnEvent(BookingConfirmedEvent.EVENT_NAME, { async: true })
  async handleBookingEscrowHold(event: BookingConfirmedEvent): Promise<void> {
    try {
      // Create ledger entries recording consumer payment into platform escrow
      await prisma.$transaction([
        prisma.ledgerEntry.create({
          data: {
            bookingId: event.bookingId,
            entryType: LedgerEntryType.DEBIT,
            accountType: LedgerAccountType.CONSUMER_PAYMENT,
            amount: event.pricePaise,
            currency: 'INR',
            description: `Payment captured for booking ${event.bookingId}`,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            bookingId: event.bookingId,
            entryType: LedgerEntryType.CREDIT,
            accountType: LedgerAccountType.PLATFORM_ESCROW,
            amount: event.pricePaise,
            currency: 'INR',
            description: `Escrow hold for booking ${event.bookingId}`,
          },
        }),
      ]);
      this.logger.log(`Escrow ledger entries recorded for booking ${event.bookingId}`);
    } catch (err) {
      this.logger.error(`Failed to record escrow ledger for ${event.bookingId}:`, err);
    }
  }

  @OnEvent(BookingCancelledEvent.EVENT_NAME, { async: true })
  async handleBookingRefundLedger(event: BookingCancelledEvent): Promise<void> {
    if (event.refundAmountPaise <= 0) return;
    try {
      await prisma.ledgerEntry.create({
        data: {
          bookingId: event.bookingId,
          entryType: LedgerEntryType.DEBIT,
          accountType: LedgerAccountType.REFUND_ESCROW,
          amount: event.refundAmountPaise,
          currency: 'INR',
          description: `Refund processed (${event.refundPercentage}%) for cancelled booking ${event.bookingId}`,
        },
      });
      this.logger.log(
        `Refund ledger recorded for booking ${event.bookingId}: ${event.refundAmountPaise} paise`,
      );
    } catch (err) {
      this.logger.error(`Failed to record refund ledger for ${event.bookingId}:`, err);
    }
  }
}

@Injectable()
export class BookingAnalyticsListener {
  private readonly logger = new Logger(BookingAnalyticsListener.name);

  @OnEvent(BookingStateChangedEvent.EVENT_NAME, { async: true })
  handleStateChangeAnalytics(event: BookingStateChangedEvent): void {
    this.logger.log(
      `📊 [Analytics] Booking transition: ${event.bookingId} | ${event.fromState} -> ${event.toState} via ${event.triggerEvent} at ${event.timestamp}`,
    );
  }
}
