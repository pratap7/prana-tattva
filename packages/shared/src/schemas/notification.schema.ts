import { z } from 'zod';

export const NotificationTypeEnum = z.enum([
  'BOOKING_CONFIRMED',
  'BOOKING_RESCHEDULED',
  'BOOKING_CANCELLED',
  'SESSION_REMINDER_24H',
  'SESSION_REMINDER_1H',
  'REVIEW_REQUEST',
  'CHAT_MESSAGE',
  'PAYMENT_CAPTURED',
  'PAYMENT_FAILED',
  'VERIFICATION_STATUS',
]);

export type NotificationType = z.infer<typeof NotificationTypeEnum>;

export const NotificationChannelEnum = z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']);

export type NotificationChannel = z.infer<typeof NotificationChannelEnum>;

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      type: z.string(),
      inApp: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
      push: z.boolean(),
    }),
  ),
});

export type UpdateNotificationPreferencesDto = z.infer<typeof updateNotificationPreferencesSchema>;

export const registerPushSubscriptionSchema = z.object({
  endpoint: z.string().url('Invalid push endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'p256dh key required'),
    auth: z.string().min(1, 'auth secret required'),
  }),
});

export type RegisterPushSubscriptionDto = z.infer<typeof registerPushSubscriptionSchema>;

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPreferenceItem {
  type: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface NotificationDeliveryLogItem {
  id: string;
  channel: string;
  type: string;
  recipient: string;
  status: 'DELIVERED' | 'SKIPPED_PREFERENCE' | 'FAILED' | 'RETRYING' | 'DEAD_LETTER';
  attempts: number;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
}
