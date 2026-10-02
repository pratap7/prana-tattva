import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  prisma,
  BookingStatus,
  UserStatus,
  ApprovalStatus,
  ReportStatus,
  ReportSeverity,
  ReviewModerationStatus,
} from '@project-nirvana/db';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ReplyReviewDto,
  UpdateReplyDto,
  ReportReviewDto,
  ReportProviderDto,
  GetReviewsQueryDto,
  ReviewItem,
  ReviewEligibility,
} from '@project-nirvana/shared';
import { ReviewModerationService } from './review-moderation.service';
import { RatingAggregationService } from './rating-aggregation.service';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly moderationService: ReviewModerationService,
    private readonly aggregationService: RatingAggregationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Checks if a booking is eligible for review by the consumer
   */
  async checkEligibility(bookingId: string, consumerId: string): Promise<ReviewEligibility> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { review: true },
    });

    if (!booking) {
      return {
        isEligible: false,
        bookingId,
        reason: 'Booking not found',
      };
    }

    if (booking.consumerId !== consumerId) {
      return {
        isEligible: false,
        bookingId,
        reason: 'Only the session seeker can review this booking',
      };
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      return {
        isEligible: false,
        bookingId,
        reason: 'Reviews are only permitted for completed sessions',
      };
    }

    if (booking.review) {
      return {
        isEligible: false,
        bookingId,
        reason: 'A review has already been submitted for this booking',
        existingReviewId: booking.review.id,
      };
    }

    const sessionFinishedAt = booking.endAt ? booking.endAt.getTime() : booking.updatedAt.getTime();

    const elapsed = Date.now() - sessionFinishedAt;
    if (elapsed > FOURTEEN_DAYS_MS) {
      return {
        isEligible: false,
        bookingId,
        reason: 'Review window has expired (14 days past completion)',
      };
    }

    const daysRemaining = Math.max(
      1,
      Math.ceil((FOURTEEN_DAYS_MS - elapsed) / (24 * 60 * 60 * 1000)),
    );

    return {
      isEligible: true,
      bookingId,
      daysRemaining,
      completedAt: new Date(sessionFinishedAt).toISOString(),
    };
  }

  /**
   * Submits a new review for a completed booking
   */
  async createReview(
    consumerId: string,
    dto: CreateReviewDto,
    clientIp?: string | null,
    userAgent?: string | null,
  ): Promise<ReviewItem> {
    // 1. Validate booking and eligibility
    const booking = await prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        review: true,
        consumer: true,
        provider: {
          include: { providerProfile: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.consumerId !== consumerId) {
      throw new ForbiddenException('Only the session seeker can review this booking');
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Reviews are only permitted for completed sessions');
    }

    if (booking.review) {
      throw new ConflictException('A review has already been submitted for this booking');
    }

    const sessionFinishedAt = booking.endAt ? booking.endAt.getTime() : booking.updatedAt.getTime();

    if (Date.now() - sessionFinishedAt > FOURTEEN_DAYS_MS) {
      throw new BadRequestException(
        'Review window has expired. Reviews must be submitted within 14 days of session completion.',
      );
    }

    // 2. Automated Moderation & Fake Detection
    const moderation = await this.moderationService.scanReview({
      comment: dto.comment,
      consumerId,
      providerId: booking.providerId,
      clientIp,
      deviceHash: dto.deviceHash || userAgent,
    });

    // 3. Create review & update provider aggregates in transaction
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          bookingId: dto.bookingId,
          consumerId,
          providerId: booking.providerId,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
          tags: dto.tags || [],
          isPublished: true,
          moderationStatus: moderation.moderationStatus,
          isFlagged: moderation.isFlagged,
          flagReasons: moderation.flagReasons,
          clientIp: clientIp || null,
          deviceHash: dto.deviceHash || userAgent || null,
        },
        include: {
          consumer: true,
          provider: { include: { providerProfile: true } },
        },
      });

      // Transactionally recalculate rating and Bayesian ranking score
      await this.aggregationService.recalculateProviderRating(booking.providerId, tx);

      return created;
    });

    // Recalculate reliability metrics asynchronously
    this.aggregationService.recalculateProviderReliability(booking.providerId).catch((err) => {
      this.logger.warn(`Failed to recalculate reliability: ${err.message}`);
    });

    // Emit event for notification
    this.eventEmitter.emit('review.created', {
      reviewId: review.id,
      providerId: booking.providerId,
      consumerId,
      rating: review.rating,
      isFlagged: review.isFlagged,
    });

    return this.mapToReviewItem(review, consumerId);
  }

  /**
   * Updates an existing review within the 48-hour edit window
   */
  async updateReview(
    reviewId: string,
    consumerId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewItem> {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.consumerId !== consumerId) {
      throw new ForbiddenException('You can only edit your own review');
    }

    const elapsed = Date.now() - review.createdAt.getTime();
    if (elapsed > FORTY_EIGHT_HOURS_MS) {
      throw new ForbiddenException(
        'Review edit window (48 hours) has expired. Reviews cannot be modified after 48 hours.',
      );
    }

    // Scan updated comment if provided
    let moderationStatus = review.moderationStatus;
    let isFlagged = review.isFlagged;
    let flagReasons = review.flagReasons;

    if (dto.comment !== undefined) {
      const scan = await this.moderationService.scanReview({
        comment: dto.comment,
        consumerId,
        providerId: review.providerId,
      });
      moderationStatus = scan.moderationStatus;
      isFlagged = scan.isFlagged;
      flagReasons = scan.flagReasons;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: reviewId },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment?.trim() || null } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          editedAt: new Date(),
          moderationStatus,
          isFlagged,
          flagReasons,
        },
        include: {
          consumer: true,
          provider: { include: { providerProfile: true } },
        },
      });

      if (dto.rating !== undefined && dto.rating !== review.rating) {
        await this.aggregationService.recalculateProviderRating(review.providerId, tx);
      }

      return saved;
    });

    return this.mapToReviewItem(updated, consumerId);
  }

  /**
   * Adds a one-time provider reply to a review
   */
  async replyToReview(
    reviewId: string,
    providerId: string,
    dto: ReplyReviewDto,
  ): Promise<ReviewItem> {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.providerId !== providerId) {
      throw new ForbiddenException('Only the practitioner can reply to this review');
    }

    if (review.providerReply) {
      throw new ConflictException(
        'A reply has already been posted for this review. You can edit your reply within 48 hours.',
      );
    }

    const replyText = dto.providerReply.trim();

    // Moderation scan on provider reply
    const scan = await this.moderationService.scanReview({
      comment: replyText,
      providerId,
    });

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        providerReply: replyText,
        providerRepliedAt: new Date(),
        ...(scan.isFlagged
          ? {
              isFlagged: true,
              flagReasons: Array.from(new Set([...review.flagReasons, ...scan.flagReasons])),
            }
          : {}),
      },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    // Notify consumer about guide's reply
    this.eventEmitter.emit('review.replied', {
      reviewId,
      consumerId: review.consumerId,
      providerId,
    });

    return this.mapToReviewItem(updated, providerId);
  }

  /**
   * Edits provider reply within the 48-hour window
   */
  async updateReply(
    reviewId: string,
    providerId: string,
    dto: UpdateReplyDto,
  ): Promise<ReviewItem> {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.providerId !== providerId) {
      throw new ForbiddenException('Only the practitioner can edit their reply');
    }

    if (!review.providerRepliedAt) {
      throw new BadRequestException('No reply exists to update');
    }

    const elapsed = Date.now() - review.providerRepliedAt.getTime();
    if (elapsed > FORTY_EIGHT_HOURS_MS) {
      throw new ForbiddenException(
        'Provider reply edit window (48 hours) has expired. Replies cannot be modified after 48 hours.',
      );
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        providerReply: dto.providerReply.trim(),
        replyEditedAt: new Date(),
      },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    return this.mapToReviewItem(updated, providerId);
  }

  /**
   * Reports an abusive or fraudulent review into the admin moderation queue
   */
  async reportReview(
    reviewId: string,
    reporterId: string,
    dto: ReportReviewDto,
  ): Promise<{ success: boolean; message: string }> {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await prisma.reviewReport.create({
      data: {
        reviewId,
        reporterId,
        reason: dto.reason,
        details: dto.details?.trim() || null,
        status: ReportStatus.PENDING,
      },
    });

    // Check report count for this review
    const totalReports = await prisma.reviewReport.count({
      where: { reviewId },
    });

    if (totalReports >= 2 || dto.reason === 'PROFANITY' || dto.reason === 'HARASSMENT') {
      await prisma.review.update({
        where: { id: reviewId },
        data: {
          isFlagged: true,
          moderationStatus: ReviewModerationStatus.FLAGGED,
        },
      });
    }

    return {
      success: true,
      message: 'Review report submitted for trust & safety administrative review.',
    };
  }

  /**
   * Reports a provider for misconduct, medical claims, scam, or harassment
   * Auto-suspends provider if severe category or multiple pending reports
   */
  async reportProvider(
    reporterId: string,
    dto: ReportProviderDto,
  ): Promise<{ success: boolean; autoSuspended: boolean; message: string }> {
    const provider = await prisma.user.findUnique({
      where: { id: dto.providerId },
      include: { providerProfile: true },
    });

    if (!provider) {
      throw new NotFoundException('Practitioner not found');
    }

    const isSevere =
      (dto.category === 'HARASSMENT' ||
        dto.category === 'SCAM' ||
        dto.category === 'MISCONDUCT' ||
        dto.category === 'MEDICAL_CLAIMS') &&
      (dto.severity === 'HIGH' || dto.severity === 'CRITICAL');

    // Count existing unresolved reports
    const existingReportsCount = await prisma.report.count({
      where: {
        reportedUserId: dto.providerId,
        status: { in: [ReportStatus.PENDING, ReportStatus.INVESTIGATING] },
      },
    });

    const shouldAutoSuspend = isSevere || existingReportsCount >= 2;

    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.report.create({
        data: {
          reporterId,
          reportedUserId: dto.providerId,
          bookingId: dto.bookingId || null,
          category: dto.category,
          reason: dto.reason.trim(),
          severity: dto.severity as ReportSeverity,
          autoSuspended: shouldAutoSuspend,
          status: shouldAutoSuspend ? ReportStatus.INVESTIGATING : ReportStatus.PENDING,
        },
      });

      if (shouldAutoSuspend) {
        // Suspend user account and provider profile pending administrative review
        await tx.user.update({
          where: { id: dto.providerId },
          data: { status: UserStatus.SUSPENDED },
        });

        await tx.providerProfile.updateMany({
          where: { userId: dto.providerId },
          data: { approvalStatus: ApprovalStatus.SUSPENDED },
        });

        await tx.auditLog.create({
          data: {
            userId: reporterId,
            action: 'PROVIDER_AUTO_SUSPENDED_REPORT',
            entityType: 'PROVIDER',
            entityId: dto.providerId,
            metadata: {
              reportId: created.id,
              category: dto.category,
              severity: dto.severity,
              reason: dto.reason,
            },
          },
        });
      }

      return created;
    });

    if (shouldAutoSuspend) {
      this.logger.warn(
        `Provider ${dto.providerId} AUTO-SUSPENDED following high-severity report #${report.id} (${dto.category})`,
      );
    }

    return {
      success: true,
      autoSuspended: shouldAutoSuspend,
      message: shouldAutoSuspend
        ? 'Report received. Given the severe nature of the allegations, the practitioner has been temporarily suspended pending investigation.'
        : 'Thank you for your report. The Trust & Safety team will review this case within 12 hours.',
    };
  }

  /**
   * Fetches published reviews for a provider
   */
  async getProviderReviews(
    providerId: string,
    query: GetReviewsQueryDto,
    currentUserId?: string,
  ): Promise<{
    reviews: ReviewItem[];
    total: number;
    page: number;
    limit: number;
    ratingBreakdown: Record<number, number>;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      providerId,
      isPublished: true,
      moderationStatus: {
        in: [ReviewModerationStatus.PUBLISHED, ReviewModerationStatus.FLAGGED],
      },
    };

    if (query.rating) {
      where.rating = query.rating;
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    const [reviews, total, allRatings] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          consumer: true,
          provider: { include: { providerProfile: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({ where }),
      prisma.review.findMany({
        where: { providerId, isPublished: true },
        select: { rating: true },
      }),
    ]);

    const ratingBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of allRatings) {
      if (ratingBreakdown[r.rating] !== undefined) {
        ratingBreakdown[r.rating]++;
      }
    }

    return {
      reviews: reviews.map((r) => this.mapToReviewItem(r, currentUserId)),
      total,
      page,
      limit,
      ratingBreakdown,
    };
  }

  /**
   * Maps Prisma Review model to client-facing ReviewItem with permission flags
   */
  private mapToReviewItem(
    review: {
      id: string;
      bookingId: string;
      consumerId: string;
      providerId: string;
      rating: number;
      comment: string | null;
      tags: string[];
      providerReply: string | null;
      providerRepliedAt: Date | null;
      isPublished: boolean;
      moderationStatus: ReviewModerationStatus;
      isFlagged: boolean;
      flagReasons: string[];
      editedAt: Date | null;
      replyEditedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      consumer?: {
        email: string;
        providerProfile?: { displayName?: string; avatarUrl?: string | null } | null;
      };
      provider?: { email: string; providerProfile?: { displayName?: string } | null };
    },
    currentUserId?: string,
  ): ReviewItem {
    const elapsedSinceCreation = Date.now() - review.createdAt.getTime();
    const canEdit =
      currentUserId === review.consumerId && elapsedSinceCreation <= FORTY_EIGHT_HOURS_MS;

    const canReply = currentUserId === review.providerId && !review.providerReply;

    const canEditReply =
      currentUserId === review.providerId &&
      !!review.providerRepliedAt &&
      Date.now() - review.providerRepliedAt.getTime() <= FORTY_EIGHT_HOURS_MS;

    const consumerName =
      review.consumer?.providerProfile?.displayName ||
      review.consumer?.email.split('@')[0] ||
      'Seeker';

    const providerName =
      review.provider?.providerProfile?.displayName ||
      review.provider?.email.split('@')[0] ||
      'Practitioner';

    return {
      id: review.id,
      bookingId: review.bookingId,
      consumerId: review.consumerId,
      consumerName,
      consumerAvatarUrl: review.consumer?.providerProfile?.avatarUrl || null,
      providerId: review.providerId,
      providerName,
      rating: review.rating,
      comment: review.comment,
      tags: review.tags,
      providerReply: review.providerReply,
      providerRepliedAt: review.providerRepliedAt?.toISOString() || null,
      isPublished: review.isPublished,
      moderationStatus: review.moderationStatus,
      isFlagged: review.isFlagged,
      flagReasons: review.flagReasons,
      editedAt: review.editedAt?.toISOString() || null,
      replyEditedAt: review.replyEditedAt?.toISOString() || null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      canEdit,
      canReply,
      canEditReply,
    };
  }
}
