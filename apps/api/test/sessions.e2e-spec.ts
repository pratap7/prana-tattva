/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { prisma, UserRole, BookingStatus, ServiceMode } from '@project-nirvana/db';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Daily.co Video Sessions (e2e)', () => {
  let app: INestApplication;
  let tokenService: TokenService;
  let consumerToken: string;
  let providerToken: string;
  let thirdPartyToken: string;

  const consumerId = '11111111-aaaa-4111-a111-111111111111';
  const providerUserId = '22222222-bbbb-4222-a222-222222222222';
  const thirdPartyUserId = '33333333-cccc-4333-a333-333333333333';

  const bookingId = uuidv4();
  const psychotherapyBookingId = uuidv4();
  const inPersonBookingId = uuidv4();
  const serviceId = uuidv4();

  const mockProviderProfile = {
    id: 'prov-prof-video-e2e',
    userId: providerUserId,
    displayName: 'Acharya Shankaran',
    city: 'Rishikesh',
    country: 'IN',
    avatarUrl: 'https://images.unsplash.com/photo-acharya.jpg',
    completedSessions: 24,
    reliabilityStrikes: 0,
    minNoticeHours: 2,
  };

  const mockServiceOnline = {
    id: serviceId,
    title: 'Vedic Mantra Meditation',
    mode: ServiceMode.ONLINE,
    durationMin: 60,
    priceAmount: 250000,
    category: {
      id: 'cat-meditation',
      name: 'Vedic Meditation',
      slug: 'vedic-meditation',
      requiresLicense: false,
    },
  };

  const mockServicePsychotherapy = {
    id: uuidv4(),
    title: 'Clinical Psychotherapy & Trauma Processing',
    mode: ServiceMode.ONLINE,
    durationMin: 60,
    priceAmount: 400000,
    category: {
      id: 'cat-psych',
      name: 'Licensed Psychotherapy',
      slug: 'licensed-psychotherapy',
      requiresLicense: true,
    },
  };

  const mockServiceInPerson = {
    id: uuidv4(),
    title: 'Ayurvedic Marma Therapy',
    mode: ServiceMode.IN_PERSON,
    durationMin: 90,
    priceAmount: 500000,
    locationAddress: 'Swarg Ashram Sanctuary, Ram Jhula, Rishikesh 249304',
    locationCity: 'Rishikesh',
    locationCoordinates: { lat: 30.1234, lng: 78.3123 },
    locationInstructions: 'Gate 3, follow the lotus pond path',
    category: {
      id: 'cat-ayurveda',
      name: 'Ayurveda',
      slug: 'ayurveda',
      requiresLicense: false,
    },
  };

  const now = Date.now();
  const startAt = new Date(now + 5 * 60 * 1000); // 5 min future (valid in -10m window)
  const endAt = new Date(now + 65 * 60 * 1000);

  const mockBooking = {
    id: bookingId,
    consumerId,
    providerId: providerUserId,
    serviceId,
    priceSnapshot: 250000,
    currency: 'INR',
    commissionBps: 1500,
    status: BookingStatus.CONFIRMED,
    startAt,
    endAt,
    service: mockServiceOnline,
    provider: {
      id: providerUserId,
      email: 'acharya@example.com',
      providerProfile: mockProviderProfile,
    },
    consumer: {
      id: consumerId,
      email: 'seeker.video@example.com',
    },
    session: null as any,
  };

  const mockPsychotherapyBooking = {
    id: psychotherapyBookingId,
    consumerId,
    providerId: providerUserId,
    serviceId: mockServicePsychotherapy.id,
    priceSnapshot: 400000,
    currency: 'INR',
    commissionBps: 1500,
    status: BookingStatus.CONFIRMED,
    startAt,
    endAt,
    service: mockServicePsychotherapy,
    provider: {
      id: providerUserId,
      email: 'acharya@example.com',
      providerProfile: mockProviderProfile,
    },
    consumer: {
      id: consumerId,
      email: 'seeker.video@example.com',
    },
    session: null as any,
  };

  const mockInPersonBooking: any = {
    id: inPersonBookingId,
    consumerId,
    providerId: providerUserId,
    serviceId: mockServiceInPerson.id,
    priceSnapshot: 500000,
    currency: 'INR',
    commissionBps: 1500,
    status: BookingStatus.PENDING_PAYMENT, // initially unconfirmed
    startAt,
    endAt,
    service: mockServiceInPerson,
    provider: {
      id: providerUserId,
      email: 'acharya@example.com',
      providerProfile: mockProviderProfile,
    },
    consumer: {
      id: consumerId,
      email: 'seeker.video@example.com',
    },
    session: null as any,
  };

  let sessionRecord: any = null;

  beforeAll(async () => {
    (jest.spyOn(prisma.refreshToken, 'create') as any).mockResolvedValue({ id: 'rt-mock' });
    (jest.spyOn(prisma.auditLog, 'create') as any).mockResolvedValue({ id: 'audit-mock' });
    (jest.spyOn(prisma.notification, 'create') as any).mockResolvedValue({ id: 'notif-mock' });
    (jest.spyOn(prisma.consentRecord, 'create') as any).mockResolvedValue({ id: 'consent-mock' });

    (jest.spyOn(prisma.booking, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      if (where.id === bookingId) return { ...mockBooking, session: sessionRecord };
      if (where.id === psychotherapyBookingId)
        return { ...mockPsychotherapyBooking, session: null };
      if (where.id === inPersonBookingId) return { ...mockInPersonBooking, session: null };
      return null;
    });

    (jest.spyOn(prisma.booking, 'findFirst') as any).mockImplementation(async () => null);

    (jest.spyOn(prisma.booking, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        if (where.id === bookingId) {
          Object.assign(mockBooking, data);
          return mockBooking;
        }
        if (where.id === inPersonBookingId) {
          Object.assign(mockInPersonBooking, data);
          return mockInPersonBooking;
        }
        return null;
      },
    );

    (jest.spyOn(prisma.session, 'upsert') as any).mockImplementation(
      async ({ create, update }: any) => {
        sessionRecord = {
          id: 'sess-video-e2e',
          bookingId,
          videoRoomName: create?.videoRoomName || update?.videoRoomName || 'nirvana-rzp-daily-e2e',
          videoRoomUrl:
            create?.videoRoomUrl ||
            update?.videoRoomUrl ||
            'https://pranatattva.daily.co/nirvana-rzp-daily-e2e',
          recordingStatus: 'DISABLED',
          recordingConsents: null,
          extendedMinutes: 0,
          metadata: null,
          startedAt: null,
          endedAt: null,
          joinedByConsumerAt: null,
          joinedByProviderAt: null,
          ...create,
          ...update,
        };
        mockBooking.session = sessionRecord;
        return sessionRecord;
      },
    );

    (jest.spyOn(prisma.session, 'findFirst') as any).mockImplementation(async () => {
      if (!sessionRecord) return null;
      return {
        ...sessionRecord,
        booking: mockBooking,
      };
    });

    (jest.spyOn(prisma.session, 'update') as any).mockImplementation(async ({ data }: any) => {
      if (sessionRecord) {
        Object.assign(sessionRecord, data);
      }
      return sessionRecord;
    });

    (jest.spyOn(prisma.providerProfile, 'update') as any).mockImplementation(
      async ({ data }: any) => {
        if (data.reliabilityStrikes?.increment) {
          mockProviderProfile.reliabilityStrikes += data.reliabilityStrikes.increment;
        }
        return mockProviderProfile;
      },
    );

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
      'seeker.video@example.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    consumerToken = cTokens.accessToken;

    const pTokens = await tokenService.generateTokens(
      providerUserId,
      'acharya@example.com',
      UserRole.PROVIDER,
      'Asia/Kolkata',
    );
    providerToken = pTokens.accessToken;

    const tTokens = await tokenService.generateTokens(
      thirdPartyUserId,
      'intruder@example.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    thirdPartyToken = tTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /sessions/:bookingId/join', () => {
    it('should allow consumer to join within schedule window and return participant token', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/join`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('roomUrl');
      expect(res.body).toHaveProperty('roomName');
      expect(res.body.isOwner).toBe(false);
      expect(res.body.partner.id).toBe(providerUserId);
      expect(res.body.partner.name).toBe('Acharya Shankaran');
      expect(res.body.recordingAllowed).toBe(true);
      expect(res.body.roomName).toMatch(/^nirvana-/);
      expect(res.body.roomName).not.toContain(bookingId); // NEVER derived from booking ID!
    });

    it('should allow provider to join and grant owner & screen-share capabilities', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/join`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.isOwner).toBe(true);
      expect(res.body.partner.id).toBe(consumerId);
      expect(res.body.token).toBeDefined();
    });

    it('should reject third party with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/join`)
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(403);
    });
  });

  describe('GET /sessions/:bookingId/status', () => {
    it('should return session status, window validity, and partner presence', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${bookingId}/status`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.bookingId).toBe(bookingId);
      expect(res.body.isWindowOpen).toBe(true);
      expect(res.body.canJoin).toBe(true);
      expect(res.body.recordingStatus).toBe('DISABLED');
    });

    it('should mask in-person address when booking is PENDING_PAYMENT', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${inPersonBookingId}/status`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.mode).toBe('IN_PERSON');
      expect(res.body.inPersonDetails).toBeDefined();
      expect(res.body.inPersonDetails.address).toContain('Exact address unlocked');
      expect(res.body.inPersonDetails.coordinates).toBeNull();
    });

    it('should reveal in-person address and coordinates once booking is CONFIRMED', async () => {
      mockInPersonBooking.status = BookingStatus.CONFIRMED;

      const res = await request(app.getHttpServer())
        .get(`/sessions/${inPersonBookingId}/status`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.inPersonDetails.address).toBe(
        'Swarg Ashram Sanctuary, Ram Jhula, Rishikesh 249304',
      );
      expect(res.body.inPersonDetails.coordinates).toEqual({ lat: 30.1234, lng: 78.3123 });
      expect(res.body.inPersonDetails.instructions).toBe('Gate 3, follow the lotus pond path');
    });
  });

  describe('Psychotherapy Recording Restrictions & Consent', () => {
    it('should strictly prohibit recording on Psychotherapy sessions', async () => {
      // 1. Join response flags recording prohibited
      const joinRes = await request(app.getHttpServer())
        .post(`/sessions/${psychotherapyBookingId}/join`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(joinRes.body.isPsychotherapy).toBe(true);
      expect(joinRes.body.recordingAllowed).toBe(false);

      // 2. Granting consent throws 403 Forbidden
      await request(app.getHttpServer())
        .post(`/sessions/${psychotherapyBookingId}/recording/consent`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ consentGranted: true })
        .expect(403);

      // 3. Starting recording throws 403 Forbidden
      await request(app.getHttpServer())
        .post(`/sessions/${psychotherapyBookingId}/recording/start`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(403);
    });

    it('should enforce double consent on standard sessions before recording can start', async () => {
      // Attempt recording with NO consent -> 400 Bad Request
      await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/recording/start`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(400);

      // Consumer grants consent
      await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/recording/consent`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ consentGranted: true })
        .expect(200);

      // Still fails with only 1 consent -> 400 Bad Request
      await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/recording/start`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(400);

      // Provider grants consent
      await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/recording/consent`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ consentGranted: true })
        .expect(200);

      // Both consented -> Start recording succeeds!
      const recRes = await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/recording/start`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(recRes.body).toHaveProperty('recordingId');
    });
  });

  describe('POST /sessions/webhook', () => {
    it('should verify signature and process participant.joined event', async () => {
      const roomName = sessionRecord?.videoRoomName || 'nirvana-rzp-daily-e2e';
      const rawPayload = JSON.stringify({
        event: 'participant.joined',
        room: roomName,
        participant: {
          user_id: providerUserId,
          owner: true,
          user_name: 'Acharya Shankaran',
        },
      });

      const signature = crypto
        .createHmac('sha256', 'daily_webhook_secret_default')
        .update(rawPayload)
        .digest('hex');

      const res = await request(app.getHttpServer())
        .post('/sessions/webhook')
        .set('x-webhook-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawPayload)
        .expect(200);

      expect(res.body.status).toBe('processed');
    });
  });

  describe('POST /sessions/:bookingId/extend', () => {
    it('should allow practitioner to extend session by 15 minutes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/extend`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ minutes: 15 })
        .expect(200);

      expect(res.body.extendedMinutes).toBe(15);
      expect(res.body.newEndAt).toBeDefined();
    });

    it('should reject extension request from consumer with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/sessions/${bookingId}/extend`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ minutes: 15 })
        .expect(403);
    });
  });
});
