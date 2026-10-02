/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import {
  prisma,
  UserRole,
  BookingStatus,
  UserStatus,
  ApprovalStatus,
  ReviewModerationStatus,
} from '@project-nirvana/db';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Reviews & Trust Layer (e2e)', () => {
  let app: INestApplication;
  let tokenService: TokenService;
  let consumerToken: string;
  let providerToken: string;
  let otherToken: string;

  const consumerId = '22222222-3333-4444-5555-666666666666';
  const providerId = '77777777-8888-4999-0000-111111111111';
  const otherUserId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffffffff';
  const bookingId = uuidv4();
  const reviewId = uuidv4();

  const mockBooking = {
    id: bookingId,
    consumerId,
    providerId,
    serviceId: uuidv4(),
    status: BookingStatus.COMPLETED,
    priceSnapshot: 350000,
    currency: 'INR',
    commissionBps: 1500,
    startAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    endAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 3600000), // completed 3 days ago
    review: null,
    consumer: { id: consumerId, email: 'seeker.rev@sanctuary.com', providerProfile: null },
    provider: {
      id: providerId,
      email: 'guide.rev@sanctuary.com',
      providerProfile: { displayName: 'Yogi Dev' },
    },
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  };

  const mockReview = {
    id: reviewId,
    bookingId,
    consumerId,
    providerId,
    rating: 5,
    comment: 'Transformative guided breathwork journey.',
    tags: ['calming', 'empathetic'],
    providerReply: null,
    providerRepliedAt: null,
    isPublished: true,
    moderationStatus: ReviewModerationStatus.PUBLISHED,
    isFlagged: false,
    flagReasons: [],
    clientIp: '127.0.0.1',
    deviceHash: null,
    editedAt: null,
    replyEditedAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 20), // 20 mins ago (within 48h)
    updatedAt: new Date(Date.now() - 1000 * 60 * 20),
    consumer: { email: 'seeker.rev@sanctuary.com', providerProfile: null },
    provider: { email: 'guide.rev@sanctuary.com', providerProfile: { displayName: 'Yogi Dev' } },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();

    tokenService = app.get<TokenService>(TokenService);

    jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({ id: 'rt-rev-mock' } as any);

    const cTokens = await tokenService.generateTokens(
      consumerId,
      'seeker.rev@sanctuary.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    consumerToken = cTokens.accessToken;

    const pTokens = await tokenService.generateTokens(
      providerId,
      'guide.rev@sanctuary.com',
      UserRole.PROVIDER,
      'Asia/Kolkata',
    );
    providerToken = pTokens.accessToken;

    const oTokens = await tokenService.generateTokens(
      otherUserId,
      'other.rev@sanctuary.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    otherToken = oTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    (jest.spyOn(prisma.refreshToken, 'create') as any).mockResolvedValue({ id: 'rt-rev-mock' });
    (jest.spyOn(prisma, '$transaction') as any).mockImplementation(async (callbackOrArray: any) => {
      if (typeof callbackOrArray === 'function') {
        return await callbackOrArray(prisma);
      }
      return await Promise.all(callbackOrArray);
    });
  });

  // ==========================================================================
  // ELIGIBILITY ENDPOINT
  // ==========================================================================
  describe('GET /reviews/eligibility/:bookingId', () => {
    it('returns eligibility status and days remaining for consumer', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);

      const res = await request(app.getHttpServer())
        .get(`/reviews/eligibility/${bookingId}`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.isEligible).toBe(true);
      expect(res.body.bookingId).toBe(bookingId);
      expect(res.body.daysRemaining).toBeDefined();
    });

    it('returns isEligible false when requested by non-consumer', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);

      const res = await request(app.getHttpServer())
        .get(`/reviews/eligibility/${bookingId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(res.body.isEligible).toBe(false);
      expect(res.body.reason).toContain('Only the session seeker');
    });
  });

  // ==========================================================================
  // SUBMIT REVIEW
  // ==========================================================================
  describe('POST /reviews', () => {
    it('fails with 401 if unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/reviews')
        .send({ bookingId, rating: 5 })
        .expect(401);
    });

    it('fails with 403 if caller is not the booking consumer', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);

      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ bookingId, rating: 5 })
        .expect(403);
    });

    it('fails with 400 if booking is not COMPLETED', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.PENDING_PAYMENT,
      } as any);

      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ bookingId, rating: 5 })
        .expect(400);
    });

    it('fails with 409 if a review already exists for this booking', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue({
        ...mockBooking,
        review: { id: 'existing-rev' },
      } as any);

      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ bookingId, rating: 5 })
        .expect(409);
    });

    it('successfully creates review and updates provider Bayesian aggregates', async () => {
      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);
      jest.spyOn(prisma.review, 'create').mockResolvedValue(mockReview as any);
      jest.spyOn(prisma.review, 'findMany').mockResolvedValue([{ rating: 5 }] as any);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });
      jest
        .spyOn(prisma.booking, 'findMany')
        .mockResolvedValue([{ status: BookingStatus.COMPLETED }] as any);
      jest.spyOn(prisma.conversation, 'findMany').mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          bookingId,
          rating: 5,
          comment: 'Transformative guided breathwork journey.',
          tags: ['calming', 'empathetic'],
        })
        .expect(201);

      expect(res.body.id).toBe(reviewId);
      expect(res.body.rating).toBe(5);
      expect(res.body.tags).toEqual(['calming', 'empathetic']);
    });
  });

  // ==========================================================================
  // EDIT REVIEW (48-HOUR WINDOW)
  // ==========================================================================
  describe('PATCH /reviews/:id', () => {
    it('allows consumer to edit their review within 48 hours', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);
      jest.spyOn(prisma.review, 'update').mockResolvedValue({
        ...mockReview,
        rating: 4,
        comment: 'Updated serene thoughts',
      } as any);
      jest.spyOn(prisma.review, 'findMany').mockResolvedValue([{ rating: 4 }] as any);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .patch(`/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ rating: 4, comment: 'Updated serene thoughts' })
        .expect(200);

      expect(res.body.rating).toBe(4);
    });

    it('rejects edit with 403 if attempted by another user', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);

      await request(app.getHttpServer())
        .patch(`/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ rating: 4 })
        .expect(403);
    });

    it('rejects edit with 403 if edit window (48h) has expired', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue({
        ...mockReview,
        createdAt: threeDaysAgo,
      } as any);

      await request(app.getHttpServer())
        .patch(`/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ rating: 4 })
        .expect(403);
    });
  });

  // ==========================================================================
  // PROVIDER REPLY & REPLY EDIT (48-HOUR WINDOW)
  // ==========================================================================
  describe('POST /reviews/:id/reply and PATCH /reviews/:id/reply', () => {
    it('allows provider to post a reply', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);
      jest.spyOn(prisma.review, 'update').mockResolvedValue({
        ...mockReview,
        providerReply: 'Thank you for stepping into the light with us.',
        providerRepliedAt: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .post(`/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ providerReply: 'Thank you for stepping into the light with us.' })
        .expect(201);

      expect(res.body.providerReply).toBe('Thank you for stepping into the light with us.');
    });

    it('rejects reply if caller is not the provider', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);

      await request(app.getHttpServer())
        .post(`/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ providerReply: 'Imposter reply.' })
        .expect(403);
    });

    it('allows provider to edit their reply within 48 hours', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue({
        ...mockReview,
        providerReply: 'Initial reply',
        providerRepliedAt: new Date(Date.now() - 3600000), // replied 1 hour ago
      } as any);

      jest.spyOn(prisma.review, 'update').mockResolvedValue({
        ...mockReview,
        providerReply: 'Edited mindful reply',
        replyEditedAt: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .patch(`/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ providerReply: 'Edited mindful reply' })
        .expect(200);

      expect(res.body.providerReply).toBe('Edited mindful reply');
    });
  });

  // ==========================================================================
  // REPORT REVIEW & REPORT PROVIDER (AUTO-SUSPENSION)
  // ==========================================================================
  describe('Reports & Trust Safeguards', () => {
    it('submits a report on an inappropriate review into admin queue', async () => {
      jest.spyOn(prisma.review, 'findUnique').mockResolvedValue(mockReview as any);
      jest.spyOn(prisma.reviewReport, 'create').mockResolvedValue({ id: 'rr-1' } as any);
      jest.spyOn(prisma.reviewReport, 'count').mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .post(`/reviews/${reviewId}/report`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ reason: 'DEFAMATION', details: 'Contains false statements' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('reports a provider for HARASSMENT (high severity) and triggers auto-suspension', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: providerId,
        providerProfile: { id: 'prof-1' },
      } as any);
      jest.spyOn(prisma.report, 'count').mockResolvedValue(0);
      jest
        .spyOn(prisma.report, 'create')
        .mockResolvedValue({ id: 'rep-sev-1', autoSuspended: true } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.providerProfile, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const res = await request(app.getHttpServer())
        .post('/reviews/report-provider')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          providerId,
          category: 'HARASSMENT',
          reason: 'Severe abusive and unprofessional conduct reported during call.',
          severity: 'HIGH',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.autoSuspended).toBe(true);
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
    });
  });

  // ==========================================================================
  // PUBLIC PROVIDER REVIEWS & RELIABILITY METRICS
  // ==========================================================================
  describe('GET /reviews/provider/:providerId and /reliability', () => {
    it('fetches published reviews and ratings distribution for provider', async () => {
      jest
        .spyOn(prisma.review, 'findMany')
        .mockResolvedValueOnce([mockReview] as any) // page query
        .mockResolvedValueOnce([{ rating: 5 }] as any); // rating breakdown query
      jest.spyOn(prisma.review, 'count').mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get(`/reviews/provider/${providerId}`)
        .expect(200);

      expect(res.body.reviews).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.ratingBreakdown[5]).toBe(1);
    });

    it('fetches provider reliability score and badges', async () => {
      jest.spyOn(prisma.providerProfile, 'findFirst').mockResolvedValue({
        ratingAvg: 4.9,
        ratingCount: 15,
        bayesianRating: 4.82,
        completionRate: 99.0,
        cancellationRate: 0.0,
        avgResponseMinutes: 45,
        completedSessions: 22,
        reliabilityBadges: [
          'Responds within 1 hour',
          '99% Session Completion',
          'Zero Cancellations',
        ],
      } as any);

      const res = await request(app.getHttpServer())
        .get(`/reviews/provider/${providerId}/reliability`)
        .expect(200);

      expect(res.body.responseBadge).toBe('Responds within 1 hour');
      expect(res.body.reliabilityBadges).toContain('Zero Cancellations');
      expect(res.body.completionRate).toBe(99.0);
    });
  });
});
