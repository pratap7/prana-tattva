/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { prisma, UserRole } from '@project-nirvana/db';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { DateTime } from 'luxon';
import { v4 as uuidv4 } from 'uuid';

describe('Booking Lifecycle & Concurrency (e2e)', () => {
  let app: INestApplication;
  let tokenService: TokenService;
  let consumerToken: string;
  let providerToken: string;

  const consumerId = '11111111-1111-4111-a111-111111111111';
  const providerUserId = '22222222-2222-4222-a222-222222222222';
  const serviceId = '33333333-3333-4333-a333-333333333333';

  const mockProviderProfile = {
    id: 'prov-profile-e2e-1',
    userId: providerUserId,
    displayName: 'Guruji Vedavyas',
    slug: 'guruji-vedavyas',
    headline: 'Traditional Vedic Meditation & Sound Practitioner',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
    city: 'Rishikesh',
    country: 'IN',
    minNoticeHours: 2,
    reliabilityStrikes: 0,
    completedSessions: 42,
    ratingAvg: '4.95',
    ratingCount: 30,
  };

  const mockService = {
    id: serviceId,
    providerId: providerUserId,
    categoryId: 'cat-meditation',
    title: 'Sacred Sound & Mantra Meditation',
    durationMin: 60,
    priceAmount: 200000, // ₹2,000
    currency: 'INR',
    isActive: true,
    mode: 'ONLINE',
    cancellationPolicy: 'MODERATE',
    category: {
      commissionBps: 1500,
    },
    provider: {
      id: 'prov-profile-e2e-1',
      userId: providerUserId,
      minNoticeHours: 2,
      user: {
        id: providerUserId,
        timeZone: 'Asia/Kolkata',
      },
      providerProfile: mockProviderProfile,
    },
  };

  const inMemoryBookings: any[] = [];
  const inMemoryPayments: any[] = [];
  const inMemorySessions: any[] = [];

  beforeAll(async () => {
    // Mock Prisma calls with self-contained in-memory storage
    (jest.spyOn(prisma.service, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      if (where.id === serviceId) return mockService as any;
      return null;
    });

    (jest.spyOn(prisma.refreshToken, 'create') as any).mockResolvedValue({ id: 'rt-mock' });
    (jest.spyOn(prisma.auditLog, 'create') as any).mockResolvedValue({ id: 'audit-mock' });
    (jest.spyOn(prisma.notification, 'create') as any).mockResolvedValue({ id: 'notif-mock' });
    (jest.spyOn(prisma.ledgerEntry, 'create') as any).mockResolvedValue({ id: 'ledger-mock' });

    (jest.spyOn(prisma.booking, 'create') as any).mockImplementation(async ({ data }: any) => {
      const b = {
        id: uuidv4(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        service: mockService,
        provider: {
          id: data.providerId,
          providerProfile: mockProviderProfile,
        },
        consumer: { id: data.consumerId, email: 'consumer@example.com' },
      };
      inMemoryBookings.push(b);
      return b as any;
    });

    (jest.spyOn(prisma.booking, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      const found = inMemoryBookings.find((b) => b.id === where.id);
      if (!found) return null;
      return {
        ...found,
        service: mockService,
        provider: {
          id: found.providerId,
          providerProfile: mockProviderProfile,
        },
        consumer: { id: found.consumerId, email: 'consumer@example.com' },
        payments: inMemoryPayments.filter((p) => p.bookingId === found.id),
        session: inMemorySessions.find((s) => s.bookingId === found.id) || null,
      } as any;
    });

    (jest.spyOn(prisma.booking, 'findMany') as any).mockImplementation(async ({ where }: any) => {
      return inMemoryBookings
        .filter((b) => {
          if (where.providerId && b.providerId !== where.providerId) return false;
          if (where.consumerId && b.consumerId !== where.consumerId) return false;
          if (where.status?.in && !where.status.in.includes(b.status)) return false;
          return true;
        })
        .map((b) => ({
          ...b,
          service: mockService,
          provider: {
            id: b.providerId,
            providerProfile: mockProviderProfile,
          },
          consumer: { id: b.consumerId, email: 'consumer@example.com' },
        })) as any;
    });

    (jest.spyOn(prisma.booking, 'findFirst') as any).mockImplementation(async ({ where }: any) => {
      const found = inMemoryBookings.find((b) => {
        if (where.id?.not && b.id === where.id.not) return false;
        if (where.providerId && b.providerId !== where.providerId) return false;
        if (where.status?.in && !where.status.in.includes(b.status)) return false;
        return true;
      });
      return (found || null) as any;
    });

    (jest.spyOn(prisma.booking, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        const idx = inMemoryBookings.findIndex((b) => b.id === where.id);
        if (idx === -1) throw new Error('Booking not found');
        const count = data.rescheduledCount?.increment
          ? (inMemoryBookings[idx].rescheduledCount || 0) + data.rescheduledCount.increment
          : data.rescheduledCount !== undefined
            ? data.rescheduledCount
            : inMemoryBookings[idx].rescheduledCount;
        const updated = {
          ...inMemoryBookings[idx],
          ...data,
          rescheduledCount: count,
          updatedAt: new Date(),
        };
        inMemoryBookings[idx] = updated;
        return {
          ...updated,
          service: mockService,
          provider: {
            id: updated.providerId,
            providerProfile: mockProviderProfile,
          },
          consumer: { id: updated.consumerId, email: 'consumer@example.com' },
        } as any;
      },
    );

    (jest.spyOn(prisma.payment, 'create') as any).mockImplementation(async ({ data }: any) => {
      const p = { id: `pay-${Date.now()}`, ...data, createdAt: new Date() };
      inMemoryPayments.push(p);
      return p as any;
    });

    (jest.spyOn(prisma.payment, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        const p = inMemoryPayments.find((pay) => pay.id === where.id);
        if (p) Object.assign(p, data);
        return p as any;
      },
    );

    (jest.spyOn(prisma.session, 'upsert') as any).mockImplementation(
      async ({ where, create, update }: any) => {
        let s = inMemorySessions.find((sess) => sess.bookingId === where.bookingId);
        if (!s) {
          s = { id: `sess-${Date.now()}`, ...create };
          inMemorySessions.push(s);
        } else {
          Object.assign(s, update);
        }
        return s as any;
      },
    );

    (jest.spyOn(prisma.providerProfile, 'update') as any).mockImplementation(
      async ({ where: _where, data }: any) => {
        if (data.reliabilityStrikes?.increment) {
          mockProviderProfile.reliabilityStrikes += data.reliabilityStrikes.increment;
        }
        return mockProviderProfile as any;
      },
    );

    (jest.spyOn(prisma, '$transaction') as any).mockImplementation(async (callbackOrArray: any) => {
      if (typeof callbackOrArray === 'function') {
        return await callbackOrArray(prisma);
      }
      return await Promise.all(callbackOrArray);
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();

    tokenService = moduleFixture.get<TokenService>(TokenService);
    const cTokens = await tokenService.generateTokens(
      consumerId,
      'consumer@example.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    consumerToken = cTokens.accessToken;

    const pTokens = await tokenService.generateTokens(
      providerUserId,
      'provider@example.com',
      UserRole.PROVIDER,
      'Asia/Kolkata',
    );
    providerToken = pTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /bookings (Slot Locking with Concurrency Safety)', () => {
    it('should create a booking in PENDING_PAYMENT with a 10-minute slot lock', async () => {
      const slotStart = DateTime.utc().plus({ days: 3, hours: 10 }).toISO()!;

      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          serviceId,
          startAt: slotStart,
          notes: 'Focus on pranayama techniques',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('PENDING_PAYMENT');
      expect(response.body.priceSnapshot).toBe(200000);
      expect(response.body.slotLockExpiresAt).toBeDefined();
      expect(response.body.lockRemainingSeconds).toBeGreaterThan(580);
      expect(response.body.cancellationPolicy).toBe('MODERATE');
    });

    it('should reject booking when advance notice window is violated', async () => {
      const tooSoonSlot = DateTime.utc().plus({ minutes: 30 }).toISO()!; // < 2 hours notice

      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          serviceId,
          startAt: tooSoonSlot,
        })
        .expect(400);

      expect(response.body.code).toBe('NOTICE_WINDOW_VIOLATION');
    });

    it('should reject second concurrent booking on an already locked slot with 409 Conflict', async () => {
      const duplicateSlot =
        inMemoryBookings[0].startAt instanceof Date
          ? inMemoryBookings[0].startAt.toISOString()
          : inMemoryBookings[0].startAt;

      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          serviceId,
          startAt: duplicateSlot,
        })
        .expect(409);

      expect(response.body.code).toBe('SLOT_TEMPORARILY_LOCKED');
    });
  });

  describe('POST /bookings/webhook/payment (Payment & Webhook Idempotency)', () => {
    it('should confirm booking on payment success and be idempotent on duplicate delivery', async () => {
      const booking = inMemoryBookings[0];

      const webhookPayload = {
        event: 'payment.captured',
        bookingId: booking.id,
        paymentId: 'pay_rzp_e2e_101',
        amount: 200000,
        status: 'captured',
      };

      // 1. Initial payment webhook delivery
      const res1 = await request(app.getHttpServer())
        .post('/bookings/webhook/payment')
        .send(webhookPayload)
        .expect(200);

      expect(res1.body.status).toBe('CONFIRMED');
      expect(res1.body.alreadyProcessed).toBe(false);

      // Verify booking state in DB is CONFIRMED and slot lock is cleared
      const updated = inMemoryBookings.find((b) => b.id === booking.id);
      expect(updated.status).toBe('CONFIRMED');
      expect(updated.slotLockExpiresAt).toBeNull();

      // 2. Duplicate delivery of the exact same payment webhook
      const res2 = await request(app.getHttpServer())
        .post('/bookings/webhook/payment')
        .send(webhookPayload)
        .expect(200);

      expect(res2.body.status).toBe('CONFIRMED');
      expect(res2.body.alreadyProcessed).toBe(true);
    });
  });

  describe('GET /bookings/:id and list endpoints', () => {
    it('should retrieve booking details for the consumer', async () => {
      const booking = inMemoryBookings[0];

      const res = await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.id).toBe(booking.id);
      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.provider.displayName).toBe('Guruji Vedavyas');
    });

    it('should list consumer bookings on GET /bookings/my', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookings/my?filter=upcoming')
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should list provider bookings on GET /bookings/provider/sessions', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookings/provider/sessions?filter=upcoming')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /bookings/:id/reschedule', () => {
    it('should reschedule an appointment and increment rescheduledCount', async () => {
      const booking = inMemoryBookings[0];
      const newSlot = DateTime.utc().plus({ days: 5, hours: 14 }).toISO()!;

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/reschedule`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          newStartAt: newSlot,
          reason: 'Need afternoon slot instead',
        })
        .expect(201);

      expect(res.body.startAt).toBe(newSlot);
      expect(res.body.rescheduledCount).toBe(1);
      expect(res.body.status).toBe('CONFIRMED');
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    it('should cancel booking and compute refund per policy', async () => {
      const booking = inMemoryBookings[0];

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          reason: 'Medical emergency',
        })
        .expect(201);

      expect(res.body.booking.status).toBe('CANCELLED_BY_CONSUMER');
      expect(res.body.refund.refundPercentage).toBeGreaterThanOrEqual(50);
      expect(res.body.refund.refundPaise).toBeGreaterThanOrEqual(100000);
    });
  });

  describe('POST /bookings/:id/attendance', () => {
    it('should record attendance timestamp for video session', async () => {
      const booking = inMemoryBookings[0];

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/attendance`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          party: 'CONSUMER',
          joinedAt: new Date().toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });
});
