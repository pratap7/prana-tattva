/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { prisma, UserRole, UserStatus } from '@project-nirvana/db';
import { AppModule } from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

describe('Authentication & RBAC (e2e)', () => {
  let app: INestApplication;
  let consumerAccessToken: string;
  let consumerRefreshToken: string;
  let providerAccessToken: string;
  let adminAccessToken: string;

  const testConsumerEmail = `seeker.${Date.now()}@example.com`;
  const testProviderEmail = `practitioner.${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';

  // In-memory test state to make e2e tests self-contained and database-independent
  const usersDb = new Map<string, any>();
  const refreshTokensDb = new Map<string, any>();
  const authTokensDb = new Map<string, any>();

  beforeAll(async () => {
    // Mock Prisma operations with in-memory stores for isolated e2e testing
    (jest.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
      const email = args?.where?.email;
      const id = args?.where?.id;
      if (email) {
        return usersDb.get(email.toLowerCase()) || null;
      }
      if (id) {
        for (const user of usersDb.values()) {
          if (user.id === id) return user;
        }
      }
      return null;
    });

    (jest.spyOn(prisma.user, 'create') as any).mockImplementation(async (args: any) => {
      const email = args.data.email.toLowerCase();
      const newUser = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        email,
        passwordHash: args.data.passwordHash,
        role: args.data.role || UserRole.CONSUMER,
        status: UserStatus.ACTIVE,
        timeZone: args.data.timeZone || 'Asia/Kolkata',
        emailVerifiedAt: null,
        providerProfile: args.data.providerProfile?.create
          ? {
              id: `profile-${Date.now()}`,
              displayName: args.data.providerProfile.create.displayName,
              slug: args.data.providerProfile.create.slug,
            }
          : null,
      };
      usersDb.set(email, newUser);
      return newUser;
    });

    (jest.spyOn(prisma.refreshToken, 'create') as any).mockImplementation(async (args: any) => {
      const record = {
        id: `rt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        ...args.data,
      };
      refreshTokensDb.set(args.data.tokenHash, record);
      return record;
    });

    (jest.spyOn(prisma.refreshToken, 'findUnique') as any).mockImplementation(async (args: any) => {
      const record = refreshTokensDb.get(args.where.tokenHash);
      if (!record) return null;

      let user = null;
      for (const u of usersDb.values()) {
        if (u.id === record.userId) {
          user = u;
          break;
        }
      }
      return { ...record, user };
    });

    (jest.spyOn(prisma.refreshToken, 'update') as any).mockImplementation(async (args: any) => {
      for (const record of refreshTokensDb.values()) {
        if (record.id === args.where.id) {
          Object.assign(record, args.data);
          return record;
        }
      }
      return null;
    });

    (jest.spyOn(prisma.refreshToken, 'updateMany') as any).mockImplementation(async (args: any) => {
      let count = 0;
      for (const record of refreshTokensDb.values()) {
        if (
          (args.where.familyId && record.familyId === args.where.familyId) ||
          (args.where.tokenHash && record.tokenHash === args.where.tokenHash) ||
          (args.where.userId && record.userId === args.where.userId)
        ) {
          Object.assign(record, args.data);
          count++;
        }
      }
      return { count };
    });

    (jest.spyOn(prisma.authToken, 'create') as any).mockImplementation(async (args: any) => {
      const record = { id: `token-${Date.now()}`, ...args.data };
      authTokensDb.set(args.data.tokenHash, record);
      return record;
    });

    (jest.spyOn(prisma.auditLog, 'create') as any).mockImplementation(async () => {
      return {} as any;
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Signup & Identity Creation', () => {
    it('POST /auth/signup creates a CONSUMER account', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: testConsumerEmail,
          password: testPassword,
          name: 'Arjun Test Seeker',
          role: 'CONSUMER',
          timeZone: 'Asia/Kolkata',
        })
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testConsumerEmail.toLowerCase());
      expect(res.body.user.role).toBe('CONSUMER');
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();

      consumerAccessToken = res.body.accessToken;
      const cookieHeader = res.headers['set-cookie'][0] as string;
      consumerRefreshToken = cookieHeader.split(';')[0].replace('refresh_token=', '');
    });

    it('POST /auth/signup creates a PROVIDER account with automatic profile', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: testProviderEmail,
          password: testPassword,
          name: 'Maya Test Practitioner',
          role: 'PROVIDER',
          timeZone: 'Asia/Kolkata',
        })
        .expect(201);

      expect(res.body.user.role).toBe('PROVIDER');
      expect(res.body.user.providerSlug).toBeDefined();
      providerAccessToken = res.body.accessToken;
    });

    it('POST /auth/signup rejects duplicate email with 409 Conflict', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: testConsumerEmail,
          password: testPassword,
          name: 'Duplicate Seeker',
          role: 'CONSUMER',
        })
        .expect(409);
    });
  });

  describe('2. Login & Token Rotation', () => {
    it('POST /auth/login authenticates with valid credentials', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testConsumerEmail,
          password: testPassword,
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(testConsumerEmail.toLowerCase());
      expect(res.headers['set-cookie']).toBeDefined();

      consumerAccessToken = res.body.accessToken;
      const cookieHeader = res.headers['set-cookie'][0] as string;
      consumerRefreshToken = cookieHeader.split(';')[0].replace('refresh_token=', '');
    });

    it('POST /auth/login rejects invalid password with 401', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testConsumerEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('POST /auth/refresh rotates refresh token and issues new access token', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${consumerRefreshToken}`])
        .send()
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
      expect(res.headers['set-cookie']).toBeDefined();

      // Update with newly rotated child token
      const cookieHeader = res.headers['set-cookie'][0] as string;
      const newRefreshToken = cookieHeader.split(';')[0].replace('refresh_token=', '');
      expect(newRefreshToken).not.toEqual(consumerRefreshToken);

      // Verify REUSE DETECTION: Re-submitting the old revoked token must fail with 401!
      await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${consumerRefreshToken}`])
        .send()
        .expect(401);

      consumerAccessToken = res.body.accessToken;
      consumerRefreshToken = newRefreshToken;
    });
  });

  describe('3. Role-Based Access Control (RBAC)', () => {
    it('GET /auth/me returns authenticated user context', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${consumerAccessToken}`)
        .expect(200);

      expect(res.body.user.email).toBe(testConsumerEmail.toLowerCase());
      expect(res.body.user.role).toBe('CONSUMER');
    });

    it('GET /auth/provider-only FORBIDS a CONSUMER with 403 Forbidden', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/auth/provider-only')
        .set('Authorization', `Bearer ${consumerAccessToken}`)
        .expect(403);

      expect(res.body.code).toMatch(/forbidden/i);
    });

    it('GET /auth/admin-only FORBIDS a CONSUMER with 403 Forbidden', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/auth/admin-only')
        .set('Authorization', `Bearer ${consumerAccessToken}`)
        .expect(403);

      expect(res.body.code).toMatch(/forbidden/i);
    });

    it('GET /auth/provider-only ALLOWS a PROVIDER with 200 OK', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .get('/auth/provider-only')
        .set('Authorization', `Bearer ${providerAccessToken}`)
        .expect(200);

      expect(res.body.message).toContain('Access granted');
    });

    it('GET /auth/admin-only FORBIDS a PROVIDER with 403 Forbidden', async () => {
      await supertest(app.getHttpServer())
        .get('/auth/admin-only')
        .set('Authorization', `Bearer ${providerAccessToken}`)
        .expect(403);
    });

    it('GET /auth/admin-only ALLOWS an ADMIN with 200 OK', async () => {
      const adminEmail = `admin.${Date.now()}@example.com`;
      const adminRes: Response = await supertest(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: adminEmail,
          password: testPassword,
          name: 'Platform Ops',
          role: 'ADMIN',
        })
        .expect(201);

      adminAccessToken = adminRes.body.accessToken;

      const res: Response = await supertest(app.getHttpServer())
        .get('/auth/admin-only')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body.message).toContain('Access granted');
    });
  });

  describe('4. Logout & Invalidation', () => {
    it('POST /auth/logout invalidates session and clears cookie', async () => {
      const res: Response = await supertest(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${consumerAccessToken}`)
        .set('Cookie', [`refresh_token=${consumerRefreshToken}`])
        .send()
        .expect(200);

      expect(res.body.message).toContain('Logged out successfully');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });
});
