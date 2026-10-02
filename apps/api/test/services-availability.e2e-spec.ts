/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { prisma, UserRole, UserStatus, CredentialStatus } from '@project-nirvana/db';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

describe('Services & Availability Slot Engine (e2e)', () => {
  let app: INestApplication;

  let providerToken: string;
  let _consumerToken: string;

  const providerUserId = `user-prov-${Date.now()}`;
  const consumerUserId = `user-cons-${Date.now()}`;
  const providerProfileId = `prof-${Date.now()}`;

  const psychotherapyCategoryId = 'cat-psychotherapy-e2e';
  const yogaCategoryId = 'cat-yoga-e2e';

  // In-memory test state
  const usersDb = new Map<string, any>();
  const providerProfilesDb = new Map<string, any>();
  const categoriesDb = new Map<string, any>();
  const credentialsDb = new Map<string, any>();
  const servicesDb = new Map<string, any>();
  const bookingsDb = new Map<string, any>();
  const rulesDb = new Map<string, any>();
  const exceptionsDb = new Map<string, any>();

  beforeAll(async () => {
    // Categories
    categoriesDb.set(psychotherapyCategoryId, {
      id: psychotherapyCategoryId,
      name: 'Psychotherapy & Counseling',
      slug: 'psychotherapy',
      requiresLicense: true,
      isActive: true,
    });

    categoriesDb.set(yogaCategoryId, {
      id: yogaCategoryId,
      name: 'Yoga & Pranayama',
      slug: 'yoga',
      requiresLicense: false,
      isActive: true,
    });

    // Users
    usersDb.set(providerUserId, {
      id: providerUserId,
      email: 'ananya.provider@example.com',
      role: UserRole.PROVIDER,
      status: UserStatus.ACTIVE,
      timeZone: 'Asia/Kolkata',
    });

    usersDb.set(consumerUserId, {
      id: consumerUserId,
      email: 'seeker@example.com',
      role: UserRole.CONSUMER,
      status: UserStatus.ACTIVE,
      timeZone: 'America/Los_Angeles',
    });

    // Provider profile
    providerProfilesDb.set(providerProfileId, {
      id: providerProfileId,
      userId: providerUserId,
      displayName: 'Ananya Vedic Healing',
      slug: 'ananya-vedic',
      headline: 'Vedic Master',
      bio: 'Deep somatic breathwork and sound healing.',
      city: 'Rishikesh',
      country: 'IN',
      bufferMinutes: 15,
      minNoticeHours: 4,
      approvalStatus: 'APPROVED',
      verificationTier: 'CREDENTIAL_VERIFIED',
      ratingAvg: '5.0',
      ratingCount: 10,
    });

    // Mock Prisma methods
    jest.spyOn(prisma.user, 'findUnique').mockImplementation((async (args: any) => {
      const id = args.where?.id;
      return usersDb.get(id) || null;
    }) as any);

    jest.spyOn(prisma.providerProfile, 'findUnique').mockImplementation((async (args: any) => {
      if (args.where?.userId) {
        for (const p of providerProfilesDb.values()) {
          if (p.userId === args.where.userId) return p;
        }
      }
      if (args.where?.id) {
        return providerProfilesDb.get(args.where.id) || null;
      }
      return null;
    }) as any);

    jest.spyOn(prisma.providerProfile, 'findFirst').mockImplementation((async (args: any) => {
      if (args.where?.OR) {
        for (const cond of args.where.OR) {
          if (cond.id && providerProfilesDb.has(cond.id)) {
            const p = providerProfilesDb.get(cond.id);
            return { ...p, user: usersDb.get(p.userId) };
          }
          if (cond.slug) {
            for (const p of providerProfilesDb.values()) {
              if (p.slug === cond.slug) {
                return { ...p, user: usersDb.get(p.userId) };
              }
            }
          }
        }
      }
      return null;
    }) as any);

    jest.spyOn(prisma.providerProfile, 'update').mockImplementation((async (args: any) => {
      const p = providerProfilesDb.get(args.where.id);
      if (!p) throw new Error('Not found');
      const updated = { ...p, ...args.data };
      providerProfilesDb.set(args.where.id, updated);
      return updated;
    }) as any);

    jest.spyOn(prisma.category, 'findUnique').mockImplementation((async (args: any) => {
      return categoriesDb.get(args.where?.id) || null;
    }) as any);

    jest.spyOn(prisma.credential, 'findFirst').mockImplementation((async (args: any) => {
      for (const c of credentialsDb.values()) {
        if (c.providerId === args.where.providerId && c.status === args.where.status) {
          return c;
        }
      }
      return null;
    }) as any);

    // Services mock
    jest.spyOn(prisma.service, 'create').mockImplementation((async (args: any) => {
      const id = `svc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const svc = {
        id,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: categoriesDb.get(args.data.categoryId),
      };
      servicesDb.set(id, svc);
      return svc;
    }) as any);

    jest.spyOn(prisma.service, 'findMany').mockImplementation((async (args: any) => {
      const list: any[] = [];
      for (const s of servicesDb.values()) {
        if (!args.where?.providerId || s.providerId === args.where.providerId) {
          list.push({ ...s, category: categoriesDb.get(s.categoryId) });
        }
      }
      return list;
    }) as any);

    jest.spyOn(prisma.service, 'findFirst').mockImplementation((async (args: any) => {
      for (const s of servicesDb.values()) {
        if (s.id === args.where.id) {
          if (args.where.providerId && s.providerId !== args.where.providerId) continue;
          if (args.where.isActive !== undefined && s.isActive !== args.where.isActive) continue;
          return { ...s, category: categoriesDb.get(s.categoryId) };
        }
      }
      return null;
    }) as any);

    jest.spyOn(prisma.service, 'update').mockImplementation((async (args: any) => {
      const s = servicesDb.get(args.where.id);
      if (!s) throw new Error('Not found');
      const updated = { ...s, ...args.data, updatedAt: new Date() };
      servicesDb.set(args.where.id, updated);
      return updated;
    }) as any);

    jest.spyOn(prisma.service, 'delete').mockImplementation((async (args: any) => {
      const s = servicesDb.get(args.where.id);
      servicesDb.delete(args.where.id);
      return s;
    }) as any);

    jest.spyOn(prisma.booking, 'count').mockImplementation((async (args: any) => {
      let count = 0;
      for (const b of bookingsDb.values()) {
        if (b.serviceId === args.where?.serviceId) count++;
      }
      return count;
    }) as any);

    jest.spyOn(prisma.booking, 'findMany').mockImplementation((async (args: any) => {
      const list: any[] = [];
      for (const b of bookingsDb.values()) {
        if (!args.where?.providerId || b.providerId === args.where.providerId) {
          list.push(b);
        }
      }
      return list;
    }) as any);

    // Availability rules mock
    jest.spyOn(prisma.availabilityRule, 'findMany').mockImplementation((async (args: any) => {
      const list: any[] = [];
      for (const r of rulesDb.values()) {
        if (r.providerId === args.where.providerId) {
          if (args.where.isActive !== undefined && r.isActive !== args.where.isActive) continue;
          list.push(r);
        }
      }
      return list;
    }) as any);

    jest.spyOn(prisma.availabilityRule, 'deleteMany').mockImplementation((async (args: any) => {
      let count = 0;
      for (const [id, r] of rulesDb.entries()) {
        if (r.providerId === args.where.providerId) {
          rulesDb.delete(id);
          count++;
        }
      }
      return { count };
    }) as any);

    jest.spyOn(prisma.availabilityRule, 'createMany').mockImplementation((async (args: any) => {
      for (const item of args.data) {
        const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        rulesDb.set(id, { id, ...item, createdAt: new Date(), updatedAt: new Date() });
      }
      return { count: args.data.length };
    }) as any);

    // Availability exceptions mock
    jest.spyOn(prisma.availabilityException, 'findMany').mockImplementation((async (args: any) => {
      const list: any[] = [];
      for (const e of exceptionsDb.values()) {
        if (e.providerId === args.where.providerId) list.push(e);
      }
      return list;
    }) as any);

    jest.spyOn(prisma.availabilityException, 'findFirst').mockImplementation((async (args: any) => {
      for (const e of exceptionsDb.values()) {
        if (e.id === args.where.id && e.providerId === args.where.providerId) return e;
      }
      return null;
    }) as any);

    jest.spyOn(prisma.availabilityException, 'create').mockImplementation((async (args: any) => {
      const id = `exc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const exc = { id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
      exceptionsDb.set(id, exc);
      return exc;
    }) as any);

    jest.spyOn(prisma.availabilityException, 'delete').mockImplementation((async (args: any) => {
      const e = exceptionsDb.get(args.where.id);
      exceptionsDb.delete(args.where.id);
      return e;
    }) as any);

    // Transaction mock
    jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return callback(prisma);
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());

    await app.init();

    const jwtService = app.get(JwtService);
    providerToken = jwtService.sign({
      sub: providerUserId,
      email: 'ananya.provider@example.com',
      role: UserRole.PROVIDER,
    });

    _consumerToken = jwtService.sign({
      sub: consumerUserId,
      email: 'seeker@example.com',
      role: UserRole.CONSUMER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // SERVICES TESTS
  // ==========================================================================
  describe('Services CRUD & Constraints', () => {
    let createdServiceId: string;

    it('rejects service creation with duration < 15 min or > 180 min', async () => {
      const res1: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Too Short Session',
          description: 'A very short meditation session.',
          categoryId: yogaCategoryId,
          durationMin: 10, // Invalid: < 15
          priceAmount: 10000,
        });

      expect(res1.status).toBe(400);

      const res2: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Too Long Session',
          description: 'A marathon meditation session.',
          categoryId: yogaCategoryId,
          durationMin: 240, // Invalid: > 180
          priceAmount: 10000,
        });

      expect(res2.status).toBe(400);
    });

    it('rejects service creation with price below floor (₹50) or above ceiling (₹1,00,000)', async () => {
      const resLow: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Underpriced Session',
          description: 'A deeply undervalued session.',
          categoryId: yogaCategoryId,
          durationMin: 60,
          priceAmount: 1000, // ₹10 < ₹50 min (5000 paise)
        });

      expect(resLow.status).toBe(400);

      const resHigh: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Overpriced Session',
          description: 'An astronomically priced session.',
          categoryId: yogaCategoryId,
          durationMin: 60,
          priceAmount: 20000000, // ₹2,00,000 > ₹1,00,000 max (10000000 paise)
        });

      expect(resHigh.status).toBe(400);
    });

    it('rejects service in licence-required category when provider lacks verified licence', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Clinical Psychotherapy Session',
          description: 'Evidence-based cognitive and trauma psychotherapy.',
          categoryId: psychotherapyCategoryId, // Requires license
          durationMin: 60,
          priceAmount: 350000,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('requires a verified professional license');
    });

    it('allows service in licence-required category once licence is VERIFIED', async () => {
      // Inject verified licence into in-memory store
      credentialsDb.set('cred-lic-1', {
        id: 'cred-lic-1',
        providerId: providerProfileId,
        type: 'LICENSE',
        status: CredentialStatus.VERIFIED,
      });

      const res: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Clinical Psychotherapy Session',
          description: 'Evidence-based cognitive and trauma psychotherapy.',
          categoryId: psychotherapyCategoryId,
          durationMin: 60,
          priceAmount: 350000,
          mode: 'ONLINE',
          cancellationPolicy: 'MODERATE',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Clinical Psychotherapy Session');
      createdServiceId = res.body.id;
    });

    it('lists all services for provider', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('updates service details', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .put(`/provider/services/${createdServiceId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Advanced Somatic & Clinical Psychotherapy',
          priceAmount: 400000,
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Advanced Somatic & Clinical Psychotherapy');
      expect(res.body.priceAmount).toBe(400000);
    });

    it('soft-deactivates rather than deleting when existing bookings are present', async () => {
      // Simulate an existing booking for this service
      bookingsDb.set('booking-123', {
        id: 'booking-123',
        serviceId: createdServiceId,
        providerId: providerUserId,
        consumerId: consumerUserId,
        startAt: new Date('2026-10-15T10:00:00Z'),
        endAt: new Date('2026-10-15T11:00:00Z'),
        status: 'CONFIRMED',
      });

      const res: Response = await supertest(app.getHttpServer())
        .delete(`/provider/services/${createdServiceId}`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(false);
      expect(res.body.softDeactivated).toBe(true);
      expect(res.body.message).toContain('deactivated to preserve booking history');

      // Verify service still exists in db but isActive is false
      const svc = servicesDb.get(createdServiceId);
      expect(svc).toBeDefined();
      expect(svc.isActive).toBe(false);
    });

    it('permanently deletes service when no bookings exist', async () => {
      // Create a throwaway service without bookings
      const svcRes: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Unbooked Meditation Intro',
          description: 'A peaceful introductory meditation.',
          categoryId: yogaCategoryId,
          durationMin: 30,
          priceAmount: 150000,
        });

      const unbookedId = svcRes.body.id;

      const deleteRes: Response = await supertest(app.getHttpServer())
        .delete(`/provider/services/${unbookedId}`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.deleted).toBe(true);
      expect(deleteRes.body.softDeactivated).toBe(false);
      expect(servicesDb.has(unbookedId)).toBe(false);
    });
  });

  // ==========================================================================
  // AVAILABILITY RULES & CONFIG TESTS
  // ==========================================================================
  describe('Availability Rules & Config', () => {
    it('sets and retrieves recurring weekly availability rules', async () => {
      const putRes: Response = await supertest(app.getHttpServer())
        .put('/provider/availability/rules')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          providerTimeZone: 'Asia/Kolkata',
          rules: [
            {
              weekday: 'MONDAY',
              startTime: '09:00',
              endTime: '13:00',
              providerTimeZone: 'Asia/Kolkata',
              isActive: true,
            },
            {
              weekday: 'WEDNESDAY',
              startTime: '14:00',
              endTime: '18:00',
              providerTimeZone: 'Asia/Kolkata',
              isActive: true,
            },
          ],
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.length).toBe(2);

      const getRes: Response = await supertest(app.getHttpServer())
        .get('/provider/availability/rules')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.length).toBe(2);
    });

    it('manages availability exceptions (blocked days and extra slots)', async () => {
      // Create vacation exception
      const postRes: Response = await supertest(app.getHttpServer())
        .post('/provider/availability/exceptions')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          startAt: '2026-10-14T00:00:00.000Z',
          endAt: '2026-10-14T23:59:59.000Z',
          isBlocked: true,
          reason: 'Diwali Sanctuary Break',
        });

      expect(postRes.status).toBe(201);
      const exceptionId = postRes.body.id;

      // List exceptions
      const listRes: Response = await supertest(app.getHttpServer())
        .get('/provider/availability/exceptions')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThanOrEqual(1);

      // Delete exception
      const delRes: Response = await supertest(app.getHttpServer())
        .delete(`/provider/availability/exceptions/${exceptionId}`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });

    it('updates buffer minutes and minimum booking notice', async () => {
      const putRes: Response = await supertest(app.getHttpServer())
        .put('/provider/availability/config')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bufferMinutes: 20,
          minNoticeHours: 6,
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.bufferMinutes).toBe(20);
      expect(putRes.body.minNoticeHours).toBe(6);

      const getRes: Response = await supertest(app.getHttpServer())
        .get('/provider/availability/config')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.bufferMinutes).toBe(20);
      expect(getRes.body.minNoticeHours).toBe(6);
    });
  });

  // ==========================================================================
  // PUBLIC SLOT GENERATION & REDIS CACHING
  // ==========================================================================
  describe('Public Slot Generation & Caching', () => {
    let testServiceId: string;

    beforeAll(async () => {
      // Create an active yoga service
      const svcRes: Response = await supertest(app.getHttpServer())
        .post('/provider/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Pranic Energy Meditation',
          description: 'Deep energy restoration session.',
          categoryId: yogaCategoryId,
          durationMin: 60,
          priceAmount: 250000,
        });
      testServiceId = svcRes.body.id;

      // Set Monday 09:00 to 17:00 IST rules
      await supertest(app.getHttpServer())
        .put('/provider/availability/rules')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          providerTimeZone: 'Asia/Kolkata',
          rules: [
            {
              weekday: 'MONDAY',
              startTime: '09:00',
              endTime: '17:00',
              providerTimeZone: 'Asia/Kolkata',
              isActive: true,
            },
          ],
        });
    });

    it('generates available slots in viewer local time zone with explicit zone name', async () => {
      // Query slots for next Monday (2026-10-19)
      const res: Response = await supertest(app.getHttpServer())
        .get(`/providers/${providerProfileId}/slots`)
        .query({
          serviceId: testServiceId,
          startDate: '2026-10-18',
          endDate: '2026-10-20',
          viewerTimeZone: 'America/Los_Angeles',
        });

      expect(res.status).toBe(200);
      expect(res.body.slots).toBeDefined();
      expect(Array.isArray(res.body.slots)).toBe(true);
      expect(res.body.cached).toBe(false);

      if (res.body.slots.length > 0) {
        const slot = res.body.slots[0];
        expect(slot.startUtc).toBeDefined();
        expect(slot.endUtc).toBeDefined();
        expect(slot.localStart).toBeDefined();
        expect(slot.localDisplay).toBeDefined();
        expect(slot.viewerTimeZone).toBe('America/Los_Angeles');
      }
    });

    it('serves subsequent requests from Redis cache (cached: true)', async () => {
      // Repeat the exact same query
      const res: Response = await supertest(app.getHttpServer())
        .get(`/providers/${providerProfileId}/slots`)
        .query({
          serviceId: testServiceId,
          startDate: '2026-10-18',
          endDate: '2026-10-20',
          viewerTimeZone: 'America/Los_Angeles',
        });

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(true);
    });

    it('invalidates slot cache immediately when provider updates availability rules', async () => {
      // Update rules
      await supertest(app.getHttpServer())
        .put('/provider/availability/rules')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          providerTimeZone: 'Asia/Kolkata',
          rules: [
            {
              weekday: 'MONDAY',
              startTime: '10:00', // Changed from 09:00
              endTime: '16:00',
              providerTimeZone: 'Asia/Kolkata',
              isActive: true,
            },
          ],
        });

      // Request again: cache must be invalidated (cached: false)
      const res: Response = await supertest(app.getHttpServer())
        .get(`/providers/${providerProfileId}/slots`)
        .query({
          serviceId: testServiceId,
          startDate: '2026-10-18',
          endDate: '2026-10-20',
          viewerTimeZone: 'America/Los_Angeles',
        });

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(false);
    });
  });
});
