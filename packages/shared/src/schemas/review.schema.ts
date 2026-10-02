import { z } from 'zod';

export const ReviewModerationStatusEnum = z.enum([
  'PUBLISHED',
  'PENDING_MODERATION',
  'FLAGGED',
  'REJECTED',
]);

export type ReviewModerationStatusType = z.infer<typeof ReviewModerationStatusEnum>;

export const ReportSeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type ReportSeverityType = z.infer<typeof ReportSeverityEnum>;

export const ProviderReportCategoryEnum = z.enum([
  'MISCONDUCT',
  'MEDICAL_CLAIMS',
  'SCAM',
  'HARASSMENT',
  'OTHER',
]);

export type ProviderReportCategory = z.infer<typeof ProviderReportCategoryEnum>;

export const createReviewSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
  rating: z
    .number()
    .int()
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5'),
  comment: z.string().max(2000, 'Comment cannot exceed 2000 characters').optional().nullable(),
  tags: z.array(z.string().min(1).max(30)).max(10, 'Cannot exceed 10 tags').optional(),
  deviceHash: z.string().optional().nullable(),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
});

export type UpdateReviewDto = z.infer<typeof updateReviewSchema>;

export const replyReviewSchema = z.object({
  providerReply: z
    .string()
    .min(2, 'Reply must be at least 2 characters')
    .max(2000, 'Reply cannot exceed 2000 characters'),
});

export type ReplyReviewDto = z.infer<typeof replyReviewSchema>;

export const updateReplySchema = z.object({
  providerReply: z
    .string()
    .min(2, 'Reply must be at least 2 characters')
    .max(2000, 'Reply cannot exceed 2000 characters'),
});

export type UpdateReplyDto = z.infer<typeof updateReplySchema>;

export const reportReviewSchema = z.object({
  reason: z.enum([
    'PROFANITY',
    'HARASSMENT',
    'DEFAMATION',
    'FAKE_REVIEW',
    'CONFLICT_OF_INTEREST',
    'OTHER',
  ]),
  details: z.string().max(1000, 'Details cannot exceed 1000 characters').optional().nullable(),
});

export type ReportReviewDto = z.infer<typeof reportReviewSchema>;

export const reportProviderSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
  category: ProviderReportCategoryEnum,
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(3000, 'Reason cannot exceed 3000 characters'),
  bookingId: z.string().uuid('Invalid booking ID').optional().nullable(),
  severity: ReportSeverityEnum.optional().default('MEDIUM'),
});

export type ReportProviderDto = z.infer<typeof reportProviderSchema>;

export const getReviewsQuerySchema = z.object({
  providerId: z.string().uuid('Invalid provider ID').optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type GetReviewsQueryDto = z.infer<typeof getReviewsQuerySchema>;

export interface ReviewItem {
  id: string;
  bookingId: string;
  consumerId: string;
  consumerName: string;
  consumerAvatarUrl?: string | null;
  providerId: string;
  providerName: string;
  rating: number;
  comment?: string | null;
  tags: string[];
  providerReply?: string | null;
  providerRepliedAt?: string | null;
  isPublished: boolean;
  moderationStatus: string;
  isFlagged: boolean;
  flagReasons?: string[];
  editedAt?: string | null;
  replyEditedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit?: boolean;
  canReply?: boolean;
  canEditReply?: boolean;
}

export interface ProviderReliabilityMetrics {
  completionRate: number;
  cancellationRate: number;
  avgResponseMinutes: number;
  responseBadge: string;
  reliabilityBadges: string[];
  bayesianRating: number;
  ratingAvg: number;
  totalReviews: number;
  completedSessions: number;
}

export interface ReviewEligibility {
  isEligible: boolean;
  bookingId: string;
  reason?: string;
  daysRemaining?: number;
  completedAt?: string;
  existingReviewId?: string | null;
}
