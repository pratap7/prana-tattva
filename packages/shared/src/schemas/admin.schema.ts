import { z } from 'zod';

// ============================================================================
// ADMIN PERMISSIONS & ROLES
// ============================================================================

export const AdminPermissionEnum = z.enum(['SUPPORT', 'FINANCE', 'TRUST_SAFETY', 'SUPER_ADMIN']);

export type AdminPermission = z.infer<typeof AdminPermissionEnum>;

export function hasAdminPermission(
  permissions: AdminPermission[] | undefined | null,
  required: AdminPermission,
): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes('SUPER_ADMIN')) return true;
  return permissions.includes(required);
}

// ============================================================================
// 1. DASHBOARD METRICS
// ============================================================================

export const adminDashboardMetricsSchema = z.object({
  gmvPaise: z.number(),
  takeRateBps: z.number(),
  commissionRevenuePaise: z.number(),
  bookingsToday: z.number(),
  totalBookings: z.number(),
  bookingsPerDay: z.array(
    z.object({
      date: z.string(),
      count: z.number(),
      volumePaise: z.number(),
    }),
  ),
  newProvidersCount: z.number(),
  pendingVerificationsCount: z.number(),
  openDisputesCount: z.number(),
  openReportsCount: z.number(),
  activeUsersCount: z.number(),
});

export type AdminDashboardMetrics = z.infer<typeof adminDashboardMetricsSchema>;

// ============================================================================
// 2. USERS & PROVIDERS SCHEMAS
// ============================================================================

export const adminUserQuerySchema = z.object({
  search: z.string().optional(),
  role: z.enum(['CONSUMER', 'PROVIDER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'email', 'status', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  exportCsv: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminUserStatusUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().min(5, 'Reason must be at least 5 characters for audit compliance'),
});

export type AdminUserStatusUpdate = z.infer<typeof adminUserStatusUpdateSchema>;

export interface AdminUserListItem {
  id: string;
  email: string;
  phone: string | null;
  role: 'CONSUMER' | 'PROVIDER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  adminPermissions: AdminPermission[];
  createdAt: string;
  providerProfile?: {
    id: string;
    displayName: string;
    slug: string;
    approvalStatus: string;
    verificationTier: string;
    ratingAvg: number;
    ratingCount: number;
    isFeatured: boolean;
  } | null;
  bookingsCount: number;
}

// ============================================================================
// 3. BOOKINGS SCHEMAS
// ============================================================================

export const adminBookingQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED_BY_CONSUMER',
      'CANCELLED_BY_PROVIDER',
      'NO_SHOW_CONSUMER',
      'NO_SHOW_PROVIDER',
      'DISPUTED',
      'REFUNDED',
    ])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  exportCsv: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
});

export type AdminBookingQuery = z.infer<typeof adminBookingQuerySchema>;

export const adminBookingCancelRefundSchema = z.object({
  reason: z.string().min(5, 'Audit compliance requires a clear cancellation rationale'),
  refundAmountPaise: z.number().int().min(0).optional(),
  penalizeProvider: z.boolean().default(false),
});

export type AdminBookingCancelRefund = z.infer<typeof adminBookingCancelRefundSchema>;

export const adminBookingForceCompleteSchema = z.object({
  reason: z.string().min(5, 'Audit compliance requires a reason for manual force-completion'),
  releaseEscrow: z.boolean().default(true),
});

export type AdminBookingForceComplete = z.infer<typeof adminBookingForceCompleteSchema>;

export interface AdminBookingTimelineEvent {
  step: string;
  timestamp: string;
  description: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 4. DISPUTES & CHAT AUDIT ACCESS
// ============================================================================

export const adminDisputesQuerySchema = z.object({
  status: z
    .enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_RELEASE', 'DISMISSED'])
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  exportCsv: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
});

export type AdminDisputesQuery = z.infer<typeof adminDisputesQuerySchema>;

export const adminDisputeResolutionSchema = z.object({
  action: z.enum([
    'REFUND_FULL',
    'REFUND_PARTIAL',
    'PENALIZE_PROVIDER',
    'DISMISS',
    'RELEASE_ESCROW',
  ]),
  refundAmountPaise: z.number().int().min(0).optional(),
  strikePenalty: z.boolean().default(false),
  reason: z.string().min(10, 'Resolution justification must be at least 10 characters'),
  adminNotes: z.string().optional(),
});

export type AdminDisputeResolution = z.infer<typeof adminDisputeResolutionSchema>;

export const adminChatLogAccessSchema = z.object({
  reason: z
    .string()
    .min(10, 'Specific justification is mandatory to access confidential session chat logs'),
});

export type AdminChatLogAccess = z.infer<typeof adminChatLogAccessSchema>;

// ============================================================================
// 5. PAYMENTS & PAYOUTS SCHEMAS
// ============================================================================

export const adminLedgerQuerySchema = z.object({
  accountType: z
    .enum([
      'CONSUMER_PAYMENT',
      'PLATFORM_ESCROW',
      'PLATFORM_REVENUE',
      'PROVIDER_PAYABLE',
      'GATEWAY_FEE',
      'REFUND_ESCROW',
    ])
    .optional(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  bookingId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  exportCsv: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
});

export type AdminLedgerQuery = z.infer<typeof adminLedgerQuerySchema>;

export const adminPayoutRetrySchema = z.object({
  payoutId: z.string().uuid(),
  reason: z.string().min(5, 'Reason for payout retry is required'),
});

export type AdminPayoutRetry = z.infer<typeof adminPayoutRetrySchema>;

export interface ReconciliationSummary {
  gatewayCapturedPaise: number;
  ledgerEscrowBalancePaise: number;
  ledgerRevenueBalancePaise: number;
  ledgerPayableBalancePaise: number;
  failedPayoutsCount: number;
  failedPayoutsVolumePaise: number;
  isReconciled: boolean;
  discrepancies: string[];
}

// ============================================================================
// 6. CONTENT, CATEGORIES & MODERATION
// ============================================================================

export const adminCategoryUpsertSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  icon: z.string().optional(),
  requiresLicense: z.boolean().default(false),
  commissionBps: z.number().int().min(0).max(10000).default(1500),
  isActive: z.boolean().default(true),
});

export type AdminCategoryUpsert = z.infer<typeof adminCategoryUpsertSchema>;

export const adminFeaturedProviderSchema = z.object({
  providerId: z.string().uuid(),
  isFeatured: z.boolean(),
  reason: z.string().min(5),
});

export type AdminFeaturedProvider = z.infer<typeof adminFeaturedProviderSchema>;

export const adminReviewModerationActionSchema = z.object({
  status: z.enum(['PUBLISHED', 'FLAGGED', 'REJECTED']),
  reason: z.string().min(5),
});

export type AdminReviewModerationAction = z.infer<typeof adminReviewModerationActionSchema>;

export const adminReportActionSchema = z.object({
  status: z.enum(['ACTIONED', 'DISMISSED']),
  actionTaken: z.string().min(5),
  adminNotes: z.string().optional(),
  suspendUser: z.boolean().default(false),
});

export type AdminReportAction = z.infer<typeof adminReportActionSchema>;

// ============================================================================
// 7. PLATFORM SETTINGS SCHEMAS
// ============================================================================

export const adminSettingsSchema = z.object({
  featureFlags: z.record(z.boolean()),
  platformFeeBps: z.number().int().min(0).max(5000),
  escrowHoldHours: z.number().int().min(0).max(720),
  cancellationDefaults: z.object({
    flexibleNoticeHours: z.number().default(24),
    moderateNoticeHours: z.number().default(48),
    strictNoticeHours: z.number().default(72),
  }),
  disclaimers: z.object({
    healthDataNotice: z.string(),
    emergencyCrisisNotice: z.string(),
  }),
  reason: z.string().min(5, 'Audit compliance requires a reason for changing platform settings'),
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;
