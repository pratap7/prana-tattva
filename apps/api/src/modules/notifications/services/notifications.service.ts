import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { prisma } from '@project-nirvana/db';
import {
  NotificationType,
  NotificationItem,
  NotificationPreferenceItem,
  NotificationDeliveryLogItem,
  UpdateNotificationPreferencesDto,
  RegisterPushSubscriptionDto,
} from '@project-nirvana/shared';
import { NotificationTemplatesService } from './notification-templates.service';
import { EmailGateway } from '../gateways/email.gateway';
import { SmsGateway } from '../gateways/sms.gateway';
import { PushGateway } from '../gateways/push.gateway';

const ALL_NOTIFICATION_TYPES: Array<{
  type: NotificationType;
  label: string;
  description: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
  defaultSms: boolean;
  defaultPush: boolean;
}> = [
  {
    type: 'BOOKING_CONFIRMED',
    label: 'Booking Confirmations',
    description: 'Immediate confirmation when your session is booked and escrow is secured',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: true,
    defaultPush: true,
  },
  {
    type: 'BOOKING_RESCHEDULED',
    label: 'Rescheduled Appointments',
    description: 'Timely alerts when an appointment time or date is shifted',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: true,
    defaultPush: true,
  },
  {
    type: 'BOOKING_CANCELLED',
    label: 'Cancellations & Refunds',
    description: 'Notifications and refund processing details on cancelled appointments',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: true,
    defaultPush: true,
  },
  {
    type: 'SESSION_REMINDER_24H',
    label: '24-Hour Session Reminder',
    description: 'Preparation guidelines and device check reminder 24 hours prior',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: false,
    defaultPush: true,
  },
  {
    type: 'SESSION_REMINDER_1H',
    label: '1-Hour Session Reminder',
    description: 'Urgent reminder when your session room lobby is opening soon',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: true,
    defaultPush: true,
  },
  {
    type: 'REVIEW_REQUEST',
    label: 'Post-Session Review',
    description: 'Invitations to share feedback after completing a sacred journey',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: false,
    defaultPush: false,
  },
  {
    type: 'CHAT_MESSAGE',
    label: 'Direct Messages',
    description: 'Alerts when a practitioner or seeker sends you a message',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: false,
    defaultPush: true,
  },
  {
    type: 'PAYMENT_CAPTURED',
    label: 'Payment Receipts',
    description: 'Transaction summaries and escrow confirmation receipts',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: false,
    defaultPush: false,
  },
  {
    type: 'PAYMENT_FAILED',
    label: 'Payment Action Required',
    description: 'Alerts if a checkout payment attempt or refund requires attention',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: true,
    defaultPush: true,
  },
  {
    type: 'VERIFICATION_STATUS',
    label: 'Practitioner Verification Updates',
    description: 'Credential review and tier status announcements',
    defaultInApp: true,
    defaultEmail: true,
    defaultSms: false,
    defaultPush: true,
  },
];

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly MAX_DELIVERY_ATTEMPTS = 3;

  constructor(
    private readonly templatesService: NotificationTemplatesService,
    private readonly emailGateway: EmailGateway,
    private readonly smsGateway: SmsGateway,
    private readonly pushGateway: PushGateway,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Primary entrypoint: dispatches an event-driven notification to a user
   * across in-app, email, SMS, and web push, strictly enforcing user preferences
   * and recording delivery logs with retry & dead-letter tracking.
   */
  async dispatch(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>,
    options?: { isCritical?: boolean },
  ): Promise<{
    inAppDispatched: boolean;
    emailDispatched: boolean;
    smsDispatched: boolean;
    pushDispatched: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        notificationPreferences: true,
        pushSubscriptions: true,
      },
    });

    if (!user) {
      this.logger.warn(`Cannot dispatch notification: User ${userId} not found`);
      return {
        inAppDispatched: false,
        emailDispatched: false,
        smsDispatched: false,
        pushDispatched: false,
      };
    }

    // 1. Render template
    const rendered = this.templatesService.render(type, data, user.locale || 'en-US');

    // 2. Fetch or compute preference for this notification type
    const savedPref = user.notificationPreferences.find((p) => p.type === type);
    const defaultMeta = ALL_NOTIFICATION_TYPES.find((t) => t.type === type);

    const allowInApp = savedPref ? savedPref.inApp : defaultMeta ? defaultMeta.defaultInApp : true;
    const allowEmail = savedPref ? savedPref.email : defaultMeta ? defaultMeta.defaultEmail : true;
    // Critical notifications (e.g. cancellation, emergency) can override SMS default if user has phone
    const allowSms = options?.isCritical
      ? true
      : savedPref
        ? savedPref.sms
        : defaultMeta
          ? defaultMeta.defaultSms
          : false;
    const allowPush = savedPref ? savedPref.push : defaultMeta ? defaultMeta.defaultPush : true;

    let inAppDispatched = false;
    let emailDispatched = false;
    let smsDispatched = false;
    let pushDispatched = false;

    // --- Channel 1: In-App ---
    if (allowInApp) {
      try {
        const notif = await prisma.notification.create({
          data: {
            userId,
            type,
            title: rendered.title,
            body: rendered.body,
            data: JSON.parse(JSON.stringify(data)),
          },
        });

        // Real-time WebSocket notification event
        this.eventEmitter.emit('notification.received', {
          userId,
          notification: notif,
        });

        await this.logDelivery({
          userId,
          notificationId: notif.id,
          channel: 'IN_APP',
          type,
          recipient: userId,
          status: 'DELIVERED',
        });
        inAppDispatched = true;
      } catch (err: unknown) {
        await this.logDelivery({
          userId,
          channel: 'IN_APP',
          type,
          recipient: userId,
          status: 'FAILED',
          error: (err as Error).message,
        });
      }
    } else {
      await this.logDelivery({
        userId,
        channel: 'IN_APP',
        type,
        recipient: userId,
        status: 'SKIPPED_PREFERENCE',
      });
    }

    // --- Channel 2: Email ---
    if (allowEmail && user.email) {
      try {
        const success = await this.emailGateway.sendEmail(
          user.email,
          rendered.emailSubject,
          rendered.emailHtml,
        );

        if (success) {
          await this.logDelivery({
            userId,
            channel: 'EMAIL',
            type,
            recipient: user.email,
            status: 'DELIVERED',
          });
          emailDispatched = true;
        } else {
          throw new Error('Email gateway reported delivery failure');
        }
      } catch (err: unknown) {
        await this.logDelivery({
          userId,
          channel: 'EMAIL',
          type,
          recipient: user.email,
          status: 'DEAD_LETTER',
          error: (err as Error).message,
        });
      }
    } else {
      await this.logDelivery({
        userId,
        channel: 'EMAIL',
        type,
        recipient: user.email,
        status: 'SKIPPED_PREFERENCE',
      });
    }

    // --- Channel 3: SMS (Critical only or explicitly opted in) ---
    if (allowSms && user.phone && rendered.smsText) {
      try {
        const success = await this.smsGateway.sendSms(user.phone, rendered.smsText);
        if (success) {
          await this.logDelivery({
            userId,
            channel: 'SMS',
            type,
            recipient: user.phone,
            status: 'DELIVERED',
          });
          smsDispatched = true;
        } else {
          throw new Error('SMS gateway failed');
        }
      } catch (err: unknown) {
        await this.logDelivery({
          userId,
          channel: 'SMS',
          type,
          recipient: user.phone,
          status: 'DEAD_LETTER',
          error: (err as Error).message,
        });
      }
    } else if (user.phone) {
      await this.logDelivery({
        userId,
        channel: 'SMS',
        type,
        recipient: user.phone,
        status: 'SKIPPED_PREFERENCE',
      });
    }

    // --- Channel 4: Web Push ---
    if (allowPush && user.pushSubscriptions.length > 0) {
      for (const sub of user.pushSubscriptions) {
        try {
          const success = await this.pushGateway.sendPushNotification(sub, {
            title: rendered.title,
            body: rendered.body,
            data,
          });
          if (success) {
            await this.logDelivery({
              userId,
              channel: 'PUSH',
              type,
              recipient: sub.endpoint,
              status: 'DELIVERED',
            });
            pushDispatched = true;
          }
        } catch (err: unknown) {
          await this.logDelivery({
            userId,
            channel: 'PUSH',
            type,
            recipient: sub.endpoint,
            status: 'DEAD_LETTER',
            error: (err as Error).message,
          });
        }
      }
    } else if (user.pushSubscriptions.length > 0) {
      await this.logDelivery({
        userId,
        channel: 'PUSH',
        type,
        recipient: `${user.pushSubscriptions.length} subscriptions`,
        status: 'SKIPPED_PREFERENCE',
      });
    }

    return { inAppDispatched, emailDispatched, smsDispatched, pushDispatched };
  }

  /**
   * Helper to write structured delivery logs with status and error tracking.
   */
  private async logDelivery(params: {
    userId: string;
    notificationId?: string;
    channel: string;
    type: string;
    recipient: string;
    status: 'DELIVERED' | 'SKIPPED_PREFERENCE' | 'FAILED' | 'RETRYING' | 'DEAD_LETTER';
    error?: string;
    payload?: Record<string, unknown>;
  }) {
    try {
      await prisma.notificationDeliveryLog.create({
        data: {
          userId: params.userId,
          notificationId: params.notificationId || null,
          channel: params.channel,
          type: params.type,
          recipient: params.recipient,
          status: params.status,
          attempts: params.status === 'DELIVERED' ? 1 : params.status === 'DEAD_LETTER' ? 3 : 1,
          maxAttempts: this.MAX_DELIVERY_ATTEMPTS,
          error: params.error || null,
          payload: params.payload ? JSON.parse(JSON.stringify(params.payload)) : null,
          sentAt: params.status === 'DELIVERED' ? new Date() : null,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write delivery log: ${(err as Error).message}`);
    }
  }

  /**
   * Returns current user notification preferences across all channels.
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferenceItem[]> {
    const saved = await prisma.notificationPreference.findMany({
      where: { userId },
    });

    const savedMap = new Map(saved.map((s) => [s.type, s]));

    return ALL_NOTIFICATION_TYPES.map((meta) => {
      const existing = savedMap.get(meta.type);
      return {
        type: meta.type,
        label: meta.label,
        description: meta.description,
        inApp: existing ? existing.inApp : meta.defaultInApp,
        email: existing ? existing.email : meta.defaultEmail,
        sms: existing ? existing.sms : meta.defaultSms,
        push: existing ? existing.push : meta.defaultPush,
      };
    });
  }

  /**
   * Updates user notification preferences in preference center.
   */
  async updateUserPreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    for (const item of dto.preferences) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_type: {
            userId,
            type: item.type,
          },
        },
        create: {
          userId,
          type: item.type,
          inApp: item.inApp,
          email: item.email,
          sms: item.sms,
          push: item.push,
        },
        update: {
          inApp: item.inApp,
          email: item.email,
          sms: item.sms,
          push: item.push,
        },
      });
    }

    return this.getUserPreferences(userId);
  }

  /**
   * Fetches paginated in-app notifications for authenticated user.
   */
  async getInAppNotifications(
    userId: string,
    limit = 30,
  ): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    const formatted: NotificationItem[] = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: (n.data as Record<string, unknown>) || null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    }));

    return { notifications: formatted, unreadCount };
  }

  /**
   * Marks a single in-app notification as read.
   */
  async markNotificationRead(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Marks all unread in-app notifications as read.
   */
  async markAllNotificationsRead(userId: string) {
    const res = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { markedCount: res.count };
  }

  /**
   * Registers a web push subscription.
   */
  async registerPushSubscription(userId: string, dto: RegisterPushSubscriptionDto) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  /**
   * Lists recent delivery logs for user.
   */
  async getDeliveryLogs(userId: string, limit = 50): Promise<NotificationDeliveryLogItem[]> {
    const logs = await prisma.notificationDeliveryLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((l) => ({
      id: l.id,
      channel: l.channel,
      type: l.type,
      recipient: l.recipient,
      status: l.status as NotificationDeliveryLogItem['status'],
      attempts: l.attempts,
      error: l.error,
      sentAt: l.sentAt ? l.sentAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    }));
  }
}
