import { z } from 'zod';
import { WEEKDAYS, AVAILABILITY_LIMITS } from '../constants';

export const AvailabilityRuleInputSchema = z.object({
  id: z.string().uuid().optional(),
  weekday: z.enum(WEEKDAYS),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format (e.g. 09:00)'),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format (e.g. 17:00)'),
  providerTimeZone: z.string().min(1, 'Provider timezone is required').default('Asia/Kolkata'),
  isActive: z.boolean().default(true),
});

export type AvailabilityRuleInput = z.infer<typeof AvailabilityRuleInputSchema>;

export const SetAvailabilityRulesSchema = z.object({
  rules: z.array(AvailabilityRuleInputSchema),
  providerTimeZone: z.string().min(1).optional(),
});

export type SetAvailabilityRulesInput = z.infer<typeof SetAvailabilityRulesSchema>;

export const CreateAvailabilityExceptionSchema = z
  .object({
    startAt: z
      .string()
      .datetime({ offset: true, message: 'startAt must be a valid ISO 8601 UTC date string' }),
    endAt: z
      .string()
      .datetime({ offset: true, message: 'endAt must be a valid ISO 8601 UTC date string' }),
    isBlocked: z.boolean().default(true),
    reason: z.string().max(255).optional(),
  })
  .refine((data) => new Date(data.startAt).getTime() < new Date(data.endAt).getTime(), {
    message: 'startAt must be strictly before endAt',
    path: ['endAt'],
  });

export type CreateAvailabilityExceptionInput = z.infer<typeof CreateAvailabilityExceptionSchema>;

export const UpdateAvailabilityConfigSchema = z.object({
  bufferMinutes: z
    .number()
    .int()
    .min(AVAILABILITY_LIMITS.MIN_BUFFER_MINUTES)
    .max(AVAILABILITY_LIMITS.MAX_BUFFER_MINUTES)
    .optional(),
  minNoticeHours: z
    .number()
    .int()
    .min(AVAILABILITY_LIMITS.MIN_NOTICE_HOURS)
    .max(AVAILABILITY_LIMITS.MAX_NOTICE_HOURS)
    .optional(),
});

export type UpdateAvailabilityConfigInput = z.infer<typeof UpdateAvailabilityConfigSchema>;

export const GetAvailableSlotsQuerySchema = z.object({
  serviceId: z.string().uuid('serviceId must be a valid UUID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in format YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in format YYYY-MM-DD'),
  viewerTimeZone: z.string().min(1).default('UTC'),
});

export type GetAvailableSlotsQueryInput = z.infer<typeof GetAvailableSlotsQuerySchema>;

export interface AvailableSlot {
  startUtc: string; // ISO 8601 UTC timestamp
  endUtc: string; // ISO 8601 UTC timestamp
  localStart: string; // e.g. "2026-10-15T09:00:00"
  localEnd: string; // e.g. "2026-10-15T10:00:00"
  localDisplay: string; // e.g. "09:00 – 10:00"
  localDate: string; // e.g. "2026-10-15"
  viewerTimeZone: string; // e.g. "America/Los_Angeles"
}
