import { z } from 'zod';
import {
  SERVICE_MODES,
  CANCELLATION_POLICIES,
  SUPPORTED_CURRENCIES,
  SERVICE_DURATION_LIMITS,
  SERVICE_PRICE_LIMITS,
} from '../constants';

export const CreateServiceSchema = z.object({
  title: z
    .string()
    .min(3, 'Service title must be at least 3 characters')
    .max(150, 'Service title cannot exceed 150 characters'),
  description: z
    .string()
    .min(10, 'Service description must be at least 10 characters')
    .max(3000, 'Service description cannot exceed 3000 characters'),
  categoryId: z.string().uuid('Category must be a valid UUID'),
  durationMin: z
    .number()
    .int('Duration must be an integer number of minutes')
    .min(
      SERVICE_DURATION_LIMITS.MIN_MINUTES,
      `Duration must be at least ${SERVICE_DURATION_LIMITS.MIN_MINUTES} minutes`,
    )
    .max(
      SERVICE_DURATION_LIMITS.MAX_MINUTES,
      `Duration cannot exceed ${SERVICE_DURATION_LIMITS.MAX_MINUTES} minutes`,
    )
    .default(SERVICE_DURATION_LIMITS.DEFAULT_MINUTES),
  priceAmount: z
    .number()
    .int('Price must be an integer in smallest currency unit (paise)')
    .min(
      SERVICE_PRICE_LIMITS.MIN_PAISE,
      `Minimum session price is ₹${SERVICE_PRICE_LIMITS.MIN_PAISE / 100}`,
    )
    .max(
      SERVICE_PRICE_LIMITS.MAX_PAISE,
      `Maximum session price is ₹${SERVICE_PRICE_LIMITS.MAX_PAISE / 100}`,
    ),
  currency: z.enum(SUPPORTED_CURRENCIES).default('INR'),
  mode: z.enum(SERVICE_MODES).default('ONLINE'),
  isGroup: z.boolean().default(false),
  maxParticipants: z
    .number()
    .int()
    .min(1, 'Group session must have at least 1 participant')
    .max(100, 'Maximum participants limit is 100')
    .default(1),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES).default('MODERATE'),
});

export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = CreateServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateServiceInput = z.infer<typeof UpdateServiceSchema>;
