/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import {
  prisma,
  UserRole,
  UserStatus,
  ApprovalStatus,
  CredentialStatus,
  VerificationTier,
} from '@project-nirvana/db';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

describe('Provider Onboarding & Verification Pipeline (e2e)', () => {
  let app: INestApplication;

  let provider1Token: string;
  let provider2Token: string;
  let adminToken: string;

  const provider1Id = `user-prov1-${Date.now()}`;
  const provider2Id = `user-prov2-${Date.now()}`;
  const adminId = `user-admin-${Date.now()}`;

  const psychotherapyCategoryId = 'cat-psychotherapy-1234';
  const yogaCategoryId = 'cat-yoga-5678';

  // In-memory test state
  const usersDb = new Map<string, any>();
  const providerProfilesDb = new Map<string, any>();
  const categoriesDb = new Map<string, any>();
  const providerCategoriesDb = new Map<string, any>();
  const credentialsDb = new Map<string, any>();
  const servicesDb = new Map<string, any>();
  const notificationsDb = new Map<string, any>();

  beforeAll(async () => {
    // Seed in-memory categories
    categoriesDb.set(psychotherapyCategoryId, {
      id: psychotherapyCategoryId,
      name: 'Psychotherapy & Counseling',
      slug: 'psychotherapy',
      description: 'Clinical psychotherapy and counseling services.',
      requiresLicense: true, // Requires verified license
      commissionBps: 1200,
      isActive: true,
      subcategories: [],
    });

    categoriesDb.set(yogaCategoryId, {
      id: yogaCategoryId,
      name: 'Yoga & Yogic Sciences',
      slug: 'yoga',
      description: 'Traditional yoga and breathwork sessions.',
      requiresLicense: false,
      commissionBps: 1500,
      isActive: true,
      subcategories: [],
    });

    // Seed mock users
    usersDb.set(provider1Id, {
      id: provider1Id,
      email: 'maya.healer@example.com',
      role: UserRole.PROVIDER,
      status: UserStatus.ACTIVE,
      timeZone: 'Asia/Kolkata',
    });

    usersDb.set(provider2Id, {
      id: provider2Id,
      email: 'arjun.yogi@example.com',
      role: UserRole.PROVIDER,
      status: UserStatus.ACTIVE,
      timeZone: 'Asia/Kolkata',
    });

    usersDb.set(adminId, {
      id: adminId,
      email: 'admin.ops@example.com',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      timeZone: 'Asia/Kolkata',
    });

    // Seed mock provider profiles
    const prof1 = {
      id: 'prof-maya-1',
      userId: provider1Id,
      displayName: 'Maya Healing Sanctuary',
      slug: 'maya-healing',
      headline: 'Holistic Therapist',
      bio: 'Transformative somatic and psychotherapy healing sessions.',
      city: 'Bengaluru',
      country: 'IN',
      languages: ['en', 'hi'],
      yearsExperience: 5,
      avatarUrl: null,
      introVideoUrl: null,
      approvalStatus: ApprovalStatus.DRAFT,
      verificationTier: VerificationTier.UNVERIFIED,
      rejectionReason: null,
      onboardingStep: 1,
      ratingAvg: '0.0',
      ratingCount: 0,
      payoutAccountId: null,
      kycStatus: 'NOT_STARTED',
    };
    providerProfilesDb.set(prof1.id, prof1);
    providerProfilesDb.set(prof1.userId, prof1);

    const prof2 = {
      id: 'prof-arjun-2',
      userId: provider2Id,
      displayName: 'Arjun Yoga Shala',
      slug: 'arjun-yoga',
      headline: 'Hatha & Vinyasa Master',
      bio: 'Traditional Himalayan Hatha Yoga and Pranayama breathwork.',
      city: 'Rishikesh',
      country: 'IN',
      languages: ['en'],
      yearsExperience: 8,
      avatarUrl: null,
      introVideoUrl: null,
      approvalStatus: ApprovalStatus.DRAFT,
      verificationTier: VerificationTier.UNVERIFIED,
      rejectionReason: null,
      onboardingStep: 1,
      ratingAvg: '0.0',
      ratingCount: 0,
      payoutAccountId: null,
      kycStatus: 'NOT_STARTED',
    };
    providerProfilesDb.set(prof2.id, prof2);
    providerProfilesDb.set(prof2.userId, prof2);

    // Mock Prisma methods
    (jest.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      const email = args?.where?.email;
      if (id) return usersDb.get(id) || null;
      if (email) {
        for (const u of usersDb.values()) {
          if (u.email === email) return u;
        }
      }
      return null;
    });

    (jest.spyOn(prisma.category, 'findMany') as any).mockImplementation(async () => {
      return Array.from(categoriesDb.values());
    });

    (jest.spyOn(prisma.category, 'findUnique') as any).mockImplementation(async (args: any) => {
      return categoriesDb.get(args.where.id) || categoriesDb.get(args.where.slug) || null;
    });

    (jest.spyOn(prisma.providerProfile, 'findUnique') as any).mockImplementation(
      async (args: any) => {
        const id = args?.where?.id;
        const userId = args?.where?.userId;
        const slug = args?.where?.slug;

        let prof = null;
        if (id) prof = providerProfilesDb.get(id);
        else if (userId) prof = providerProfilesDb.get(userId);
        else if (slug) {
          for (const p of providerProfilesDb.values()) {
            if (p.slug === slug) {
              prof = p;
              break;
            }
          }
        }

        if (!prof) return null;

        const profileCategories: any[] = [];
        for (const pc of providerCategoriesDb.values()) {
          if (pc.providerId === prof.id) {
            profileCategories.push({
              ...pc,
              category: categoriesDb.get(pc.categoryId),
            });
          }
        }

        const profileCredentials: any[] = [];
        for (const c of credentialsDb.values()) {
          if (c.providerId === prof.id) {
            profileCredentials.push(c);
          }
        }

        const profileServices: any[] = [];
        for (const s of servicesDb.values()) {
          if (s.providerId === prof.id) {
            profileServices.push({
              ...s,
              category: categoriesDb.get(s.categoryId),
            });
          }
        }

        return {
          ...prof,
          categories: profileCategories,
          credentials: profileCredentials,
          services: profileServices,
          user: usersDb.get(prof.userId),
        };
      },
    );

    (jest.spyOn(prisma.providerProfile, 'findMany') as any).mockImplementation(
      async (args: any) => {
        const status = args?.where?.approvalStatus;
        const results: any[] = [];
        for (const p of providerProfilesDb.values()) {
          if (!results.some((r) => r.id === p.id)) {
            if (!status || p.approvalStatus === status) {
              const user = usersDb.get(p.userId);
              results.push({
                ...p,
                user,
                categories: [],
                credentials: [],
                services: [],
              });
            }
          }
        }
        return results;
      },
    );

    (jest.spyOn(prisma.providerProfile, 'update') as any).mockImplementation(async (args: any) => {
      const prof = providerProfilesDb.get(args.where.id);
      if (!prof) return null;
      Object.assign(prof, args.data);
      return prof;
    });

    (jest.spyOn(prisma.providerCategory, 'deleteMany') as any).mockImplementation(
      async (args: any) => {
        for (const [key, pc] of providerCategoriesDb.entries()) {
          if (pc.providerId === args.where.providerId) {
            providerCategoriesDb.delete(key);
          }
        }
        return { count: 1 };
      },
    );

    (jest.spyOn(prisma.providerCategory, 'createMany') as any).mockImplementation(
      async (args: any) => {
        for (const item of args.data) {
          const key = `${item.providerId}_${item.categoryId}`;
          providerCategoriesDb.set(key, item);
        }
        return { count: args.data.length };
      },
    );

    (jest.spyOn(prisma.providerCategory, 'count') as any).mockImplementation(async (args: any) => {
      let count = 0;
      for (const pc of providerCategoriesDb.values()) {
        if (pc.providerId === args.where.providerId) count++;
      }
      return count;
    });

    (jest.spyOn(prisma.credential, 'create') as any).mockImplementation(async (args: any) => {
      const cred = {
        id: `cred-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      credentialsDb.set(cred.id, cred);
      return cred;
    });

    (jest.spyOn(prisma.credential, 'findUnique') as any).mockImplementation(async (args: any) => {
      const cred = credentialsDb.get(args.where.id);
      if (!cred) return null;
      const provider = providerProfilesDb.get(cred.providerId);
      return {
        ...cred,
        provider,
      };
    });

    (jest.spyOn(prisma.credential, 'findFirst') as any).mockImplementation(async (args: any) => {
      for (const c of credentialsDb.values()) {
        if (c.providerId === args.where.providerId) {
          if (args.where.status && c.status !== args.where.status) continue;
          if (args.where.type?.in && !args.where.type.in.includes(c.type)) continue;
          return c;
        }
      }
      return null;
    });

    (jest.spyOn(prisma.credential, 'update') as any).mockImplementation(async (args: any) => {
      const cred = credentialsDb.get(args.where.id);
      if (!cred) return null;
      Object.assign(cred, args.data);
      return cred;
    });

    (jest.spyOn(prisma.credential, 'delete') as any).mockImplementation(async (args: any) => {
      credentialsDb.delete(args.where.id);
      return { id: args.where.id };
    });

    (jest.spyOn(prisma.credential, 'count') as any).mockImplementation(async (args: any) => {
      let count = 0;
      for (const c of credentialsDb.values()) {
        if (c.providerId === args.where.providerId) count++;
      }
      return count;
    });

    (jest.spyOn(prisma.service, 'findFirst') as any).mockImplementation(async (args: any) => {
      for (const s of servicesDb.values()) {
        if (s.providerId === args.where.providerId) return s;
      }
      return null;
    });

    (jest.spyOn(prisma.service, 'create') as any).mockImplementation(async (args: any) => {
      const s = {
        id: `svc-${Date.now()}`,
        ...args.data,
      };
      servicesDb.set(s.id, s);
      return s;
    });

    (jest.spyOn(prisma.service, 'update') as any).mockImplementation(async (args: any) => {
      const s = servicesDb.get(args.where.id);
      if (!s) return null;
      Object.assign(s, args.data);
      return s;
    });

    (jest.spyOn(prisma.auditLog, 'create') as any).mockImplementation(async () => ({
      id: 'audit-1',
    }));
    (jest.spyOn(prisma.notification, 'create') as any).mockImplementation(async (args: any) => {
      const n = { id: `notif-${Date.now()}`, ...args.data };
      notificationsDb.set(n.id, n);
      return n;
    });

    (jest.spyOn(prisma, '$transaction') as any).mockImplementation(async (promises: any[]) => {
      return Promise.all(promises);
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    // Generate test JWTs for authenticated requests
    const jwtService = app.get(JwtService);
    provider1Token = jwtService.sign({
      sub: provider1Id,
      email: 'maya.healer@example.com',
      role: UserRole.PROVIDER,
      timeZone: 'Asia/Kolkata',
    });
    provider2Token = jwtService.sign({
      sub: provider2Id,
      email: 'arjun.yogi@example.com',
      role: UserRole.PROVIDER,
      timeZone: 'Asia/Kolkata',
    });
    adminToken = jwtService.sign({
      sub: adminId,
      email: 'admin.ops@example.com',
      role: UserRole.ADMIN,
      timeZone: 'Asia/Kolkata',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ==========================================================================
  // SUITE 1: ONBOARDING WIZARD STEPS & AUTOSAVE AS DRAFT
  // ==========================================================================
  describe('Onboarding Wizard & Draft Progress', () => {
    it('GET /provider/onboarding returns current state as DRAFT', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/provider/onboarding')
        .set('Authorization', `Bearer ${provider1Token}`)
        .expect(200);

      expect(res.body.profile.approvalStatus).toBe(ApprovalStatus.DRAFT);
      expect(res.body.profile.displayName).toBe('Maya Healing Sanctuary');
    });

    it('PUT /provider/onboarding/step/1 updates basic info and sets step = 2', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .put('/provider/onboarding/step/1')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          displayName: 'Maya Sharma, PhD',
          headline: 'Senior Clinical Psychotherapist & Energy Healer',
          bio: 'Practicing integrated psychotherapy and mindfulness meditation for over 10 years with deep clinical expertise.',
          languages: ['en', 'hi'],
          city: 'Bengaluru',
          country: 'IN',
          yearsExperience: 10,
          avatarUrl: 'https://example.com/maya.jpg',
        })
        .expect(200);

      expect(res.body.displayName).toBe('Maya Sharma, PhD');
      expect(res.body.onboardingStep).toBe(2);
      expect(res.body.approvalStatus).toBe(ApprovalStatus.DRAFT);
    });

    it('PUT /provider/onboarding/step/2 attaches category and warns when license required', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .put('/provider/onboarding/step/2')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          categoryIds: [psychotherapyCategoryId, yogaCategoryId],
          primaryCategoryId: psychotherapyCategoryId,
        })
        .expect(200);

      expect(res.body.requiresLicenseWarning).toBe(true);
      expect(res.body.licenseRequiredCategories.length).toBe(1);
      expect(res.body.licenseRequiredCategories[0].name).toContain('Psychotherapy');
    });
  });

  // ==========================================================================
  // SUITE 2: LICENCE-GATING LOGIC (SERVICE LAYER ENFORCEMENT)
  // ==========================================================================
  describe('Licence-Gating Logic in Service Layer', () => {
    let uploadedCredId: string;

    it('PUT /provider/onboarding/step/4 FORBIDS creating Psychotherapy service without verified licence', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .put('/provider/onboarding/step/4')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          introVideoUrl: 'https://youtube.com/watch?v=sample',
          sampleService: {
            title: 'Individual Cognitive Psychotherapy Session',
            description: 'Confidential clinical CBT therapy session.',
            categoryId: psychotherapyCategoryId, // Requires license!
            durationMin: 60,
            priceAmount: 250000, // ₹2,500
            mode: 'ONLINE',
          },
        })
        .expect(403);

      expect(res.body.message).toContain('Licence Gating Enforcement');
      expect(res.body.code).toMatch(/forbidden/i);
    });

    it('POST /provider/onboarding/step/3/credential uploads licence in PENDING status', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/provider/onboarding/step/3/credential')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          type: 'LICENSE',
          title: 'Licensed Clinical Psychologist (RCI)',
          issuer: 'Rehabilitation Council of India',
          documentUrl: 'credentials/prof-maya-1/licence_rci_123.pdf',
        })
        .expect(201);

      uploadedCredId = res.body.id;
      expect(res.body.status).toBe(CredentialStatus.PENDING);
    });

    it('PUT /provider/onboarding/step/4 STILL FORBIDS psychotherapy service while licence is PENDING', async () => {
      await supertest(app.getHttpServer())
        .put('/provider/onboarding/step/4')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          sampleService: {
            title: 'Individual Cognitive Psychotherapy Session',
            description: 'Confidential clinical CBT therapy session.',
            categoryId: psychotherapyCategoryId,
            durationMin: 60,
            priceAmount: 250000,
            mode: 'ONLINE',
          },
        })
        .expect(403);
    });

    it('ADMIN reviews and marks credential as VERIFIED', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post(`/admin/verification/prof-maya-1/credential/${uploadedCredId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'VERIFIED',
          notes: 'RCI registration number verified against national clinical database.',
        })
        .expect(200);

      expect(res.body.status).toBe('VERIFIED');
    });

    it('PUT /provider/onboarding/step/4 ALLOWS Psychotherapy service now that licence is VERIFIED', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .put('/provider/onboarding/step/4')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          introVideoUrl: 'https://youtube.com/watch?v=sample',
          sampleService: {
            title: 'Individual Cognitive Psychotherapy Session',
            description: 'Confidential clinical CBT therapy session.',
            categoryId: psychotherapyCategoryId,
            durationMin: 60,
            priceAmount: 250000,
            mode: 'ONLINE',
          },
        })
        .expect(200);

      expect(res.body.service).not.toBeNull();
      expect(res.body.service.title).toBe('Individual Cognitive Psychotherapy Session');
    });
  });

  // ==========================================================================
  // SUITE 3: AUTHORIZATION ON PRIVATE DOCUMENT URLS
  // ==========================================================================
  describe('Authorization on Private Document URLs', () => {
    let credentialId: string;

    beforeAll(async () => {
      const res = await supertest(app.getHttpServer())
        .post('/provider/onboarding/step/3/credential')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          type: 'IDENTITY_DOCUMENT',
          title: 'Government Passport Photo ID',
          issuer: 'Passport Authority',
          documentUrl: 'credentials/prof-maya-1/passport.pdf',
        })
        .expect(201);

      credentialId = res.body.id;
    });

    it('ALLOWS the owner provider to generate the secure download URL', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get(`/provider/onboarding/credentials/${credentialId}/download-url`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .expect(200);

      expect(res.body.downloadUrl).toContain('Signature=');
      expect(res.body.expiresInSeconds).toBe(900);
    });

    it('ALLOWS platform ADMIN to generate the secure download URL', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get(`/provider/onboarding/credentials/${credentialId}/download-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.downloadUrl).toContain('Signature=');
    });

    it('FORBIDS a different provider (Provider 2) from accessing Provider 1 credential document', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get(`/provider/onboarding/credentials/${credentialId}/download-url`)
        .set('Authorization', `Bearer ${provider2Token}`)
        .expect(403);

      expect(res.body.code).toMatch(/forbidden/i);
    });
  });

  // ==========================================================================
  // SUITE 4: STATE TRANSITION TESTS & PUBLIC VISIBILITY
  // ==========================================================================
  describe('State Transitions for approvalStatus & Public Profile Visibility', () => {
    it('Configures Step 5 Payout (Razorpay Route) successfully', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/provider/onboarding/step/5/payout')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({
          accountHolderName: 'Maya Sharma',
          accountNumber: '123456789012',
          ifscCode: 'HDFC0001234',
          businessType: 'individual',
          pan: 'ABCDE1234F',
        })
        .expect(200);

      expect(res.body.payoutAccount.accountId).toMatch(/^acc_/);
      expect(res.body.payoutAccount.kycStatus).toBe('UNDER_REVIEW');
    });

    it('Step 6: Transitions approvalStatus from DRAFT to PENDING on submission', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/provider/onboarding/step/6/submit')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ confirmAccurate: true })
        .expect(200);

      expect(res.body.approvalStatus).toBe(ApprovalStatus.PENDING);
    });

    it('PUBLIC ACCESS: Rejects anonymous seeker with 404 while approvalStatus = PENDING', async () => {
      await supertest(app.getHttpServer()).get('/providers/public/maya-healing').expect(404);
    });

    it('ADMIN QUEUE: Pending profile appears in admin verification queue', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/admin/verification/queue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const mayaApp = res.body.find((a: any) => a.slug === 'maya-healing');
      expect(mayaApp).toBeDefined();
      expect(mayaApp.approvalStatus).toBe('PENDING');
    });

    it('ADMIN: Can request more information -> transitions status to DRAFT with guidance', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/admin/verification/prof-maya-1/request-info')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Please clarify your clinical practice hours in your bio.' })
        .expect(200);

      expect(res.body.approvalStatus).toBe(ApprovalStatus.DRAFT);
      expect(res.body.rejectionReason).toContain('Please clarify');
    });

    it('PROVIDER: Re-submits application -> transitions back to PENDING', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/provider/onboarding/step/6/submit')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ confirmAccurate: true })
        .expect(200);

      expect(res.body.approvalStatus).toBe(ApprovalStatus.PENDING);
    });

    it('ADMIN: Approves provider -> transitions status to APPROVED with verification tier', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/admin/verification/prof-maya-1/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verificationTier: 'CREDENTIAL_VERIFIED',
          adminNotes: 'All verified.',
        })
        .expect(200);

      expect(res.body.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(res.body.verificationTier).toBe('CREDENTIAL_VERIFIED');
    });

    it('PUBLIC ACCESS: Now ALLOWED for anonymous seekers because approvalStatus = APPROVED', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/providers/public/maya-healing')
        .expect(200);

      expect(res.body.profile.displayName).toBe('Maya Sharma, PhD');
      expect(res.body.profile.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(res.body.profile.verificationTier).toBe('CREDENTIAL_VERIFIED');
      expect(res.body.services.length).toBeGreaterThan(0);
      expect(res.body.seo.title).toContain('Maya Sharma, PhD');
      expect(res.body.jsonLd['@graph']).toBeDefined();
    });
  });
});
