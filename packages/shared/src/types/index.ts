import { z } from 'zod';

export const ApiErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export interface Money {
  amount: number; // in smallest unit, e.g. paise or cents
  currency: string;
}
