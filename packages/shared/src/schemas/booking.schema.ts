import { z } from 'zod';
import { BookingStatus, CancellationPolicy, ServiceMode } from '../constants/index.js';

export const BOOKING_EVENTS = [
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'LOCK_EXPIRED',
  'RESCHEDULE',
  'CANCEL_BY_CONSUMER',
  'CANCEL_BY_PROVIDER',
  'SESSION_ATTENDED',
  'CONSUMER_NO_SHOW',
  'PROVIDER_NO_SHOW',
  'DISPUTE_RAISED',
  'REFUND_PROCESSED',
] as const;

export type BookingEvent = (typeof BOOKING_EVENTS)[number];

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

export const createBookingSchema = z.object({
  serviceId: z.string().uuid({ message: 'Valid service ID is required' }),
  startAt: z.string().datetime({ message: 'startAt must be a valid ISO 8601 UTC datetime string' }),
  notes: z.string().max(2000, { message: 'Notes cannot exceed 2000 characters' }).optional(),
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  newStartAt: z
    .string()
    .datetime({ message: 'newStartAt must be a valid ISO 8601 UTC datetime string' }),
  reason: z.string().max(500).optional(),
});

export type RescheduleBookingDto = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .min(3, { message: 'Cancellation reason must be at least 3 characters' })
    .max(1000, { message: 'Cancellation reason cannot exceed 1000 characters' }),
});

export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;

export const paymentWebhookSchema = z.object({
  event: z.string().min(1),
  bookingId: z.string().uuid(),
  paymentId: z.string().min(1),
  orderId: z.string().optional(),
  amount: z.number().int().positive().optional(),
  status: z.enum(['captured', 'failed', 'authorized', 'refunded']).default('captured'),
  idempotencyKey: z.string().optional(),
});

export type PaymentWebhookDto = z.infer<typeof paymentWebhookSchema>;

export const recordAttendanceSchema = z.object({
  party: z.enum(['CONSUMER', 'PROVIDER', 'BOTH']),
  joinedAt: z.string().datetime().optional(),
});

export type RecordAttendanceDto = z.infer<typeof recordAttendanceSchema>;

// ============================================================================
// RESPONSE MODELS
// ============================================================================

export interface BookingSummaryResponse {
  id: string;
  consumerId: string;
  providerId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  priceSnapshot: number; // In paise
  priceSnapshotRupees: number;
  currency: string;
  commissionBps: number;
  notes?: string | null;
  slotLockExpiresAt?: string | null;
  lockRemainingSeconds?: number;
  refundAmount?: number | null;
  refundReason?: string | null;
  cancelledAt?: string | null;
  rescheduledCount: number;
  cancellationPolicy: CancellationPolicy;
  service: {
    id: string;
    title: string;
    durationMin: number;
    mode: ServiceMode;
    cancellationPolicy: CancellationPolicy;
  };
  provider: {
    id: string;
    userId: string;
    displayName: string;
    slug: string;
    headline: string;
    avatarUrl: string | null;
    city: string;
    country: string;
    ratingAvg: number;
    ratingCount: number;
  };
  consumer?: {
    id: string;
    displayName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RefundCalculationResult {
  refundPercentage: number;
  refundPaise: number;
  refundRupees: number;
  hoursBeforeSession: number;
  policy: CancellationPolicy;
  cancelledBy: 'CONSUMER' | 'PROVIDER';
  explanation: string;
}

/**
 * Pure function: Calculate refund amount strictly per cancellation policy and notice window
 *
 * Rules:
 * 1. Provider cancellation: Always 100% refund, regardless of timing.
 * 2. Session already started (hoursBefore <= 0): 0% refund for consumer.
 * 3. Consumer cancellation by policy:
 *    - FLEXIBLE:
 *      * >= 24h: 100% refund
 *      * < 24h: 0% refund
 *    - MODERATE:
 *      * >= 48h: 100% refund
 *      * 24h <= hours < 48h: 75% refund (or standard 50% within 24h)
 *      * < 24h: 50% refund
 *    - STRICT:
 *      * >= 48h: 50% refund
 *      * < 48h: 0% refund
 */
export function calculateRefund(
  policy: CancellationPolicy,
  pricePaise: number,
  hoursBefore: number,
  cancelledBy: 'CONSUMER' | 'PROVIDER',
): RefundCalculationResult {
  // Provider cancellation always yields 100% refund
  if (cancelledBy === 'PROVIDER') {
    return {
      refundPercentage: 100,
      refundPaise: pricePaise,
      refundRupees: Math.round(pricePaise / 100),
      hoursBeforeSession: hoursBefore,
      policy,
      cancelledBy,
      explanation:
        'Provider cancellation guarantees a 100% full refund to consumer with a reliability strike recorded.',
    };
  }

  // If the session has already commenced or passed, 0% refund
  if (hoursBefore <= 0) {
    return {
      refundPercentage: 0,
      refundPaise: 0,
      refundRupees: 0,
      hoursBeforeSession: hoursBefore,
      policy,
      cancelledBy,
      explanation: 'Session has already started or elapsed. Non-refundable.',
    };
  }

  let refundPercentage = 0;
  let explanation = '';

  switch (policy) {
    case 'FLEXIBLE':
      if (hoursBefore >= 24) {
        refundPercentage = 100;
        explanation = 'FLEXIBLE policy: Full 100% refund up to 24 hours prior to session start.';
      } else {
        refundPercentage = 0;
        explanation =
          'FLEXIBLE policy: Cancellations within 24 hours of session start are non-refundable.';
      }
      break;

    case 'MODERATE':
      if (hoursBefore >= 48) {
        refundPercentage = 100;
        explanation =
          'MODERATE policy: Full 100% refund for cancellations at least 48 hours prior.';
      } else if (hoursBefore >= 24) {
        refundPercentage = 50;
        explanation =
          'MODERATE policy: 50% refund for cancellations between 24 and 48 hours prior.';
      } else {
        refundPercentage = 50;
        explanation = 'MODERATE policy: 50% refund for cancellations within 24 hours.';
      }
      break;

    case 'STRICT':
      if (hoursBefore >= 48) {
        refundPercentage = 50;
        explanation =
          'STRICT policy: 50% refund for cancellations made at least 48 hours in advance.';
      } else {
        refundPercentage = 0;
        explanation =
          'STRICT policy: Non-refundable for cancellations within 48 hours of session start.';
      }
      break;

    default:
      refundPercentage = 0;
      explanation = 'Default non-refundable policy.';
  }

  const refundPaise = Math.round((pricePaise * refundPercentage) / 100);

  return {
    refundPercentage,
    refundPaise,
    refundRupees: Math.round(refundPaise / 100),
    hoursBeforeSession: hoursBefore,
    policy,
    cancelledBy,
    explanation,
  };
}
