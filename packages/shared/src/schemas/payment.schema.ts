import { z } from 'zod';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

export const createPaymentOrderSchema = z.object({
  bookingId: z.string().uuid({ message: 'Valid booking ID is required' }),
});

export type CreatePaymentOrderDto = z.infer<typeof createPaymentOrderSchema>;

export const verifyPaymentSignatureSchema = z.object({
  bookingId: z.string().uuid({ message: 'Valid booking ID is required' }),
  razorpayOrderId: z.string().min(1, { message: 'Razorpay order ID is required' }),
  razorpayPaymentId: z.string().min(1, { message: 'Razorpay payment ID is required' }),
  razorpaySignature: z.string().min(1, { message: 'Razorpay signature is required' }),
});

export type VerifyPaymentSignatureDto = z.infer<typeof verifyPaymentSignatureSchema>;

export const adminRefundSchema = z.object({
  paymentId: z.string().uuid({ message: 'Valid payment ID is required' }),
  amountPaise: z
    .number()
    .int()
    .positive({ message: 'Amount in paise must be positive' })
    .optional(),
  reason: z.string().min(3, { message: 'Reason must be at least 3 characters' }).max(1000),
});

export type AdminRefundDto = z.infer<typeof adminRefundSchema>;

export const reconcileLedgerSchema = z.object({
  targetDate: z.string().optional(),
});

export type ReconcileLedgerDto = z.infer<typeof reconcileLedgerSchema>;

// ============================================================================
// RESPONSE MODELS & INTERFACES
// ============================================================================

export interface PaymentOrderResponse {
  orderId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
  bookingId: string;
  taxBreakdown: GstBreakdown;
}

export interface GstBreakdown {
  totalAmount: number; // in paise
  baseAmount: number; // in paise
  cgst: number; // in paise (9%)
  sgst: number; // in paise (9%)
  igst: number; // in paise (18% for interstate)
  totalTax: number; // in paise
  rateBps: number; // 1800 = 18%
  sacCode: string; // '998399'
  currency: string;
}

export interface ProviderEarningsResponse {
  providerId: string;
  currency: string;
  pendingEscrowPaise: number;
  availableForPayoutPaise: number;
  paidOutPaise: number;
  totalRevenuePaise: number;
  totalCommissionPaidPaise: number;
  disputeHoldHours: number;
  reliabilityStrikes: number;
  transactions: Array<{
    bookingId: string;
    serviceTitle: string;
    clientEmail: string;
    sessionDate: string;
    grossAmountPaise: number;
    commissionBps: number;
    commissionPaise: number;
    netProviderPaise: number;
    escrowStatus: 'HELD_IN_ESCROW' | 'DISPUTE_HOLD' | 'READY_FOR_PAYOUT' | 'PAID_OUT' | 'REFUNDED';
    payoutDate?: string | null;
    transferId?: string | null;
  }>;
}

export interface LedgerReconciliationResult {
  timestamp: string;
  balanced: boolean;
  totalDebitsPaise: number;
  totalCreditsPaise: number;
  discrepancyPaise: number;
  totalEntries: number;
  paymentDiscrepancies: Array<{
    paymentId: string;
    amountPaise: number;
    issue: string;
  }>;
  payoutDiscrepancies: Array<{
    payoutId: string;
    amountPaise: number;
    issue: string;
  }>;
}

// ============================================================================
// MATHEMATICAL PURITY UTILITIES
// ============================================================================

/**
 * Calculates GST breakdown for Indian taxation compliance (SAC 998399).
 * Standard rate: 18% inclusive (9% CGST + 9% SGST).
 * Guarantee: baseAmount + totalTax === totalAmountPaise (no paise lost or created).
 */
export function computeGstBreakdown(
  totalAmountPaise: number,
  gstRateBps: number = 1800,
): GstBreakdown {
  // Base = round(Total * 10000 / (10000 + RateBps))
  const baseAmount = Math.round((totalAmountPaise * 10000) / (10000 + gstRateBps));
  const totalTax = totalAmountPaise - baseAmount;
  const cgst = Math.round(totalTax / 2);
  const sgst = totalTax - cgst; // Exact balancing

  return {
    totalAmount: totalAmountPaise,
    baseAmount,
    cgst,
    sgst,
    igst: 0,
    totalTax,
    rateBps: gstRateBps,
    sacCode: '998399',
    currency: 'INR',
  };
}

/**
 * Calculates platform commission and provider payable share.
 * Strictly guarantees that commissionPaise + providerSharePaise === totalAmountPaise.
 * Never creates or destroys paise through rounding.
 */
export function calculateCommissionAndShare(
  totalAmountPaise: number,
  commissionBps: number,
): { commissionPaise: number; providerSharePaise: number } {
  if (totalAmountPaise <= 0) {
    return { commissionPaise: 0, providerSharePaise: 0 };
  }
  const safeCommissionBps = Math.max(0, Math.min(10000, commissionBps));
  const commissionPaise = Math.round((totalAmountPaise * safeCommissionBps) / 10000);
  const providerSharePaise = totalAmountPaise - commissionPaise;

  return {
    commissionPaise,
    providerSharePaise,
  };
}
