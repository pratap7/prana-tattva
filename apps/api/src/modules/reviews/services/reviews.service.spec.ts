/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  prisma,
  BookingStatus,
  UserStatus,
  ApprovalStatus,
  ReviewModerationStatus,
} from '@project-nirvana/db';
import { ReviewsService } from './reviews.service';
import { ReviewModerationService } from './review-moderation.service';
import { RatingAggregationService } from './rating-aggregation.service';

jest.mock('@project-nirvana/db', () => ({
  prisma: {
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    review: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    reviewReport: {
      create: jest.fn(),
      count: jest.fn(),
    },
    report: {
      create: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    providerProfile: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    conversation: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  BookingStatus: {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    CONFIRMED: 'CONFIRMED',
    COMPLETED: 'COMPLETED',
    CANCELLED_BY_CONSUMER: 'CANCELLED_BY_CONSUMER',
    CANCELLED_BY_PROVIDER: 'CANCELLED_BY_PROVIDER',
    NO_SHOW_CONSUMER: 'NO_SHOW_CONSUMER',
    NO_SHOW_PROVIDER: 'NO_SHOW_PROVIDER',
  },
  UserStatus: {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
  },
  ApprovalStatus: {
    APPROVED: 'APPROVED',
    SUSPENDED: 'SUSPENDED',
  },
  ReviewModerationStatus: {
    PUBLISHED: 'PUBLISHED',
    FLAGGED: 'FLAGGED',
    REJECTED: 'REJECTED',
  },
  ReportStatus: {
    PENDING: 'PENDING',
    INVESTIGATING: 'INVESTIGATING',
  },
  Prisma: {
    Decimal: class {
      val: number;
      constructor(v: number) {
        this.val = v;
      }
      toString() {
        return String(this.val);
      }
      toNumber() {
        return this.val;
      }
    },
  },
}));

describe('ReviewsService & Trust Layer', () => {
  let reviewsService: ReviewsService;
  let moderationService: ReviewModerationService;
  let aggregationService: RatingAggregationService;

  const consumerId = 'consumer-uuid-1';
  const providerId = 'provider-uuid-2';
  const intruderId = 'intruder-uuid-3';
  const bookingId = 'booking-uuid-4';
  const reviewId = 'review-uuid-5';

  const mockBooking = {
    id: bookingId,
    consumerId,
    providerId,
    status: BookingStatus.COMPLETED,
    startAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    endAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600000), // completed 2 days ago
    review: null,
    consumer: { email: 'seeker@sanctuary.com' },
    provider: { email: 'guide@sanctuary.com', providerProfile: { displayName: 'Swami Ananda' } },
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  };

  const mockReview = {
    id: reviewId,
    bookingId,
    consumerId,
    providerId,
    rating: 5,
    comment: 'Profoundly grounding sound bath session.',
    tags: ['calming', 'punctual'],
    providerReply: null,
    providerRepliedAt: null,
    isPublished: true,
    moderationStatus: ReviewModerationStatus.PUBLISHED,
    isFlagged: false,
    flagReasons: [],
    clientIp: '127.0.0.1',
    deviceHash: 'device-hash-1',
    editedAt: null,
    replyEditedAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // created 30 mins ago (within 48h)
    updatedAt: new Date(Date.now() - 1000 * 60 * 30),
    consumer: { email: 'seeker@sanctuary.com', providerProfile: null },
    provider: { email: 'guide@sanctuary.com', providerProfile: { displayName: 'Swami Ananda' } },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        ReviewModerationService,
        RatingAggregationService,
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    reviewsService = module.get<ReviewsService>(ReviewsService);
    moderationService = module.get<ReviewModerationService>(ReviewModerationService);
    aggregationService = module.get<RatingAggregationService>(RatingAggregationService);

    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. ELIGIBILITY RULES
  // ==========================================================================
  describe('Eligibility Rules', () => {
    it('should throw NotFoundException if booking does not exist', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(null);

      await expect(
        reviewsService.createReview(consumerId, {
          bookingId: 'non-existent',
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if caller is not the session consumer', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);

      await expect(
        reviewsService.createReview(intruderId, {
          bookingId,
          rating: 5,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if booking is NOT COMPLETED (e.g. CONFIRMED)', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      } as any);

      await expect(
        reviewsService.createReview(consumerId, {
          bookingId,
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if a review already exists for this booking', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue({
        ...mockBooking,
        review: { id: 'existing-review-id' },
      } as any);

      await expect(
        reviewsService.createReview(consumerId, {
          bookingId,
          rating: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if more than 14 days have elapsed since completion', async () => {
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue({
        ...mockBooking,
        endAt: fifteenDaysAgo,
        updatedAt: fifteenDaysAgo,
      } as any);

      await expect(
        reviewsService.createReview(consumerId, {
          bookingId,
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed when booking is COMPLETED, by consumer, within 14 days, and not yet reviewed', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);
      jest.spyOn(prisma.review, 'create').mockResolvedValue(mockReview as any);
      jest.spyOn(aggregationService, 'recalculateProviderRating').mockResolvedValue({
        ratingAvg: 5.0,
        ratingCount: 1,
        bayesianRating: 4.58,
      });

      const res = await reviewsService.createReview(
        consumerId,
        {
          bookingId,
          rating: 5,
          comment: 'Profoundly grounding sound bath session.',
          tags: ['calming', 'punctual'],
        },
        '127.0.0.1',
        'device-hash-1',
      );

      expect(res.id).toBe(reviewId);
      expect(res.rating).toBe(5);
      expect(res.tags).toEqual(['calming', 'punctual']);
      expect(aggregationService.recalculateProviderRating).toHaveBeenCalledWith(providerId, prisma);
    });

    it('checkEligibility should report days remaining and true status', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);

      const eligibility = await reviewsService.checkEligibility(bookingId, consumerId);
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.daysRemaining).toBe(13); // completed ~47 hours ago -> 13 days left
    });
  });

  // ==========================================================================
  // 2. RATING AGGREGATION & BAYESIAN CALCULATION UNDER CONCURRENCY
  // ==========================================================================
  describe('Rating Aggregation & Bayesian Score Calculation', () => {
    it('correctly calculates Bayesian average preventing 1-review provider from jumping to 5.0', async () => {
      // 1 review of 5-stars
      // formula: (1 * 5.0 + 5 * 4.5) / (1 + 5) = 27.5 / 6 = 4.58
      jest.spyOn(prisma.review, 'findMany').mockResolvedValue([{ rating: 5 }] as any);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });

      const result = await aggregationService.recalculateProviderRating(providerId);

      expect(result.ratingAvg).toBe(5.0);
      expect(result.ratingCount).toBe(1);
      expect(result.bayesianRating).toBe(4.58);
      expect(prisma.providerProfile.updateMany).toHaveBeenCalled();
    });

    it('rewards high volume with higher confidence Bayesian rating', async () => {
      // 10 reviews of 5-stars
      // formula: (10 * 5.0 + 5 * 4.5) / 15 = 72.5 / 15 = 4.83
      const tenReviews = Array(10).fill({ rating: 5 });
      jest.spyOn(prisma.review, 'findMany').mockResolvedValue(tenReviews as any);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });

      const result = await aggregationService.recalculateProviderRating(providerId);

      expect(result.ratingAvg).toBe(5.0);
      expect(result.ratingCount).toBe(10);
      expect(result.bayesianRating).toBe(4.83);
    });

    it('correctly computes provider reliability score and badges', async () => {
      jest
        .spyOn(prisma.booking, 'findMany')
        .mockResolvedValue([
          { status: BookingStatus.COMPLETED },
          { status: BookingStatus.COMPLETED },
          { status: BookingStatus.COMPLETED },
          { status: BookingStatus.COMPLETED },
          { status: BookingStatus.COMPLETED },
        ] as any);

      jest.spyOn(prisma.conversation, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.providerProfile, 'findFirst').mockResolvedValue({
        ratingAvg: 4.9,
        ratingCount: 5,
        bayesianRating: 4.7,
      } as any);

      const metrics = await aggregationService.recalculateProviderReliability(providerId);

      expect(metrics.completionRate).toBe(100.0);
      expect(metrics.cancellationRate).toBe(0.0);
      expect(metrics.reliabilityBadges).toContain('Zero Cancellations');
      expect(metrics.reliabilityBadges).toContain('99% Session Completion');
    });
  });

  // ==========================================================================
  // 3. 48-HOUR EDIT WINDOWS & PROVIDER REPLIES
  // ==========================================================================
  describe('Edit Windows & Provider Reply Rules', () => {
    it('allows consumer to edit their review within 48 hours', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);
      jest.spyOn(prisma.review, 'update').mockResolvedValue({
        ...mockReview,
        rating: 4,
        comment: 'Updated meditation feedback',
        editedAt: new Date(),
      } as any);
      jest.spyOn(aggregationService, 'recalculateProviderRating').mockResolvedValue({
        ratingAvg: 4.0,
        ratingCount: 1,
        bayesianRating: 4.42,
      });

      const updated = await reviewsService.updateReview(reviewId, consumerId, {
        rating: 4,
        comment: 'Updated meditation feedback',
      });

      expect(updated.rating).toBe(4);
      expect(updated.comment).toBe('Updated meditation feedback');
      expect(aggregationService.recalculateProviderRating).toHaveBeenCalled();
    });

    it('rejects consumer edit if more than 48 hours have passed', async () => {
      const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue({
        ...mockReview,
        createdAt: fiftyHoursAgo,
      } as any);

      await expect(
        reviewsService.updateReview(reviewId, consumerId, {
          rating: 4,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects consumer edit attempted by another user', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);

      await expect(
        reviewsService.updateReview(reviewId, intruderId, {
          rating: 4,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows provider to reply once to a review', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);
      jest.spyOn(prisma.review, 'update').mockResolvedValue({
        ...mockReview,
        providerReply: 'Thank you for your presence and mindfulness.',
        providerRepliedAt: new Date(),
      } as any);

      const res = await reviewsService.replyToReview(reviewId, providerId, {
        providerReply: 'Thank you for your presence and mindfulness.',
      });

      expect(res.providerReply).toBe('Thank you for your presence and mindfulness.');
      expect(res.providerRepliedAt).toBeDefined();
    });

    it('rejects provider reply if a reply has already been posted', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue({
        ...mockReview,
        providerReply: 'First reply already exists.',
        providerRepliedAt: new Date(),
      } as any);

      await expect(
        reviewsService.replyToReview(reviewId, providerId, {
          providerReply: 'Second reply attempt.',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows provider to edit their reply within 48 hours', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue({
        ...mockReview,
        providerReply: 'Initial reply',
        providerRepliedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // replied 2 hours ago
      } as any);

      jest.spyOn(prisma.review, 'update').mockResolvedValue({
        ...mockReview,
        providerReply: 'Refined mindful reply',
        replyEditedAt: new Date(),
      } as any);

      const res = await reviewsService.updateReply(reviewId, providerId, {
        providerReply: 'Refined mindful reply',
      });

      expect(res.providerReply).toBe('Refined mindful reply');
    });

    it('rejects provider reply edit after 48 hours have elapsed', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue({
        ...mockReview,
        providerReply: 'Initial reply',
        providerRepliedAt: new Date(Date.now() - 50 * 60 * 60 * 1000), // replied 50 hours ago
      } as any);

      await expect(
        reviewsService.updateReply(reviewId, providerId, {
          providerReply: 'Expired reply edit',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // 4. MODERATION FLAGS & PROVIDER AUTO-SUSPENSION
  // ==========================================================================
  describe('Moderation & Provider Auto-Suspension', () => {
    it('flags review containing profanity or external links without dropping it', async () => {
      const scan1 = await moderationService.scanReview({
        comment: 'This practitioner was a total bitch and scammer.',
        providerId,
      });
      expect(scan1.isFlagged).toBe(true);
      expect(scan1.flagReasons).toContain('PROFANITY');

      const scan2 = await moderationService.scanReview({
        comment: 'Book me directly at http://cheap-therapy.com or email me@test.com',
        providerId,
      });
      expect(scan2.isFlagged).toBe(true);
      expect(scan2.flagReasons).toContain('EXTERNAL_LINK');
    });

    it('auto-suspends provider pending investigation on severe category reports (HARASSMENT/SCAM)', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: providerId,
        providerProfile: { id: 'prof-1' },
      } as any);

      jest.spyOn(prisma.report, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({
        id: 'report-sev-1',
        autoSuspended: true,
      } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const result = await reviewsService.reportProvider(consumerId, {
        providerId,
        category: 'HARASSMENT',
        reason: 'Practitioner engaged in aggressive harassment during the session.',
        severity: 'HIGH',
      });

      expect(result.autoSuspended).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: providerId },
          data: { status: UserStatus.SUSPENDED },
        }),
      );
      expect(prisma.providerProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: providerId },
          data: { approvalStatus: ApprovalStatus.SUSPENDED },
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PROVIDER_AUTO_SUSPENDED_REPORT',
          }),
        }),
      );
    });
  });
});
