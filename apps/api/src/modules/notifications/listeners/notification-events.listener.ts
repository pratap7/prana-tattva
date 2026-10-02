import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../services/notifications.service';
import { ReminderQueueService } from '../queues/reminder.queue';
import { prisma } from '@project-nirvana/db';

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly reminderQueueService: ReminderQueueService,
  ) {}

  /**
   * Booking confirmed: dispatches confirmation notifications & schedules BullMQ reminders.
   */
  @OnEvent('booking.confirmed')
  async handleBookingConfirmed(payload: {
    bookingId: string;
    consumerId?: string;
    providerId?: string;
  }) {
    this.logger.log(`Handling booking.confirmed for booking ${payload.bookingId}`);
    const booking = await prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        service: true,
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!booking) return;

    const sessionTimeStr = booking.startAt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const providerName =
      booking.provider.providerProfile?.displayName || booking.provider.email.split('@')[0];
    const consumerName = booking.consumer.email.split('@')[0];

    // 1. Notify Consumer
    await this.notificationsService.dispatch(booking.consumerId, 'BOOKING_CONFIRMED', {
      bookingId: booking.id,
      serviceTitle: booking.service.title,
      providerName,
      sessionTime: sessionTimeStr,
    });

    // 2. Notify Provider
    await this.notificationsService.dispatch(booking.providerId, 'BOOKING_CONFIRMED', {
      bookingId: booking.id,
      serviceTitle: booking.service.title,
      providerName: consumerName,
      sessionTime: sessionTimeStr,
    });

    // 3. Schedule 24h, 1h, and review reminders via BullMQ
    await this.reminderQueueService.scheduleSessionReminders({
      id: booking.id,
      startAt: booking.startAt,
      endAt: booking.endAt,
      consumerId: booking.consumerId,
      providerId: booking.providerId,
      serviceTitle: booking.service.title,
    });
  }

  /**
   * Booking rescheduled: dispatches reschedule notices & replaces old BullMQ reminder jobs.
   */
  @OnEvent('booking.rescheduled')
  async handleBookingRescheduled(payload: {
    bookingId: string;
    previousStartAt?: Date | string;
    newStartAt: Date | string;
  }) {
    this.logger.log(`Handling booking.rescheduled for booking ${payload.bookingId}`);
    const booking = await prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        service: true,
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!booking) return;

    const newTimeStr = booking.startAt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const providerName =
      booking.provider.providerProfile?.displayName || booking.provider.email.split('@')[0];

    // Notify Consumer
    await this.notificationsService.dispatch(booking.consumerId, 'BOOKING_RESCHEDULED', {
      bookingId: booking.id,
      serviceTitle: booking.service.title,
      providerName,
      newTime: newTimeStr,
    });

    // Notify Provider
    await this.notificationsService.dispatch(booking.providerId, 'BOOKING_RESCHEDULED', {
      bookingId: booking.id,
      serviceTitle: booking.service.title,
      providerName,
      newTime: newTimeStr,
    });

    // Reschedule BullMQ reminders (removes old jobs!)
    await this.reminderQueueService.rescheduleSessionReminders({
      id: booking.id,
      startAt: booking.startAt,
      endAt: booking.endAt,
      consumerId: booking.consumerId,
      providerId: booking.providerId,
      serviceTitle: booking.service.title,
    });
  }

  /**
   * Booking cancelled: dispatches cancellation & refund notice & cancels all BullMQ reminders.
   */
  @OnEvent('booking.cancelled')
  async handleBookingCancelled(payload: {
    bookingId: string;
    refundAmountPaise?: number;
    reason?: string;
    cancelledBy?: 'CONSUMER' | 'PROVIDER';
  }) {
    this.logger.log(`Handling booking.cancelled for booking ${payload.bookingId}`);
    const booking = await prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        service: true,
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!booking) return;

    const refundAmount = payload.refundAmountPaise ?? booking.refundAmount ?? 0;

    // Critical notification to consumer
    await this.notificationsService.dispatch(
      booking.consumerId,
      'BOOKING_CANCELLED',
      {
        bookingId: booking.id,
        serviceTitle: booking.service.title,
        refundAmount,
        reason: payload.reason || booking.refundReason || 'Appointment cancelled',
      },
      { isCritical: true },
    );

    // Notification to provider
    await this.notificationsService.dispatch(
      booking.providerId,
      'BOOKING_CANCELLED',
      {
        bookingId: booking.id,
        serviceTitle: booking.service.title,
        refundAmount,
        reason: payload.reason || booking.refundReason || 'Appointment cancelled',
      },
      { isCritical: true },
    );

    // Cancel all scheduled BullMQ reminder jobs (removes old jobs!)
    await this.reminderQueueService.cancelSessionReminders(booking.id);
  }

  /**
   * Payment captured: dispatches payment receipt to consumer.
   */
  @OnEvent('payment.captured')
  async handlePaymentCaptured(payload: { bookingId: string; amount: number; paymentId: string }) {
    const booking = await prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: { service: true },
    });

    if (!booking) return;

    await this.notificationsService.dispatch(booking.consumerId, 'PAYMENT_CAPTURED', {
      bookingId: booking.id,
      serviceTitle: booking.service.title,
      amount: payload.amount,
      paymentId: payload.paymentId,
    });
  }

  /**
   * New direct message: dispatches in-app / push / email alert.
   */
  @OnEvent('message.sent')
  async handleMessageSent(payload: {
    conversationId: string;
    senderId: string;
    recipientId: string;
    senderName: string;
    hasAttachment: boolean;
  }) {
    await this.notificationsService.dispatch(payload.recipientId, 'CHAT_MESSAGE', {
      conversationId: payload.conversationId,
      senderName: payload.senderName,
      hasAttachment: payload.hasAttachment,
    });
  }
}
