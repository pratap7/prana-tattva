/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import {
  prisma,
  UserRole,
  BookingStatus,
  LedgerEntryType,
  LedgerAccountType,
} from '@project-nirvana/db';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Payments & Financial Ledger (e2e)', () => {
  let app: INestApplication;
  let tokenService: TokenService;
  let consumerToken: string;
  let providerToken: string;
  let adminToken: string;

  const consumerId = '11111111-2222-4333-a444-555555555555';
  const providerUserId = '22222222-3333-4444-a555-666666666666';
  const adminUserId = '33333333-4444-4555-a666-777777777777';
  const bookingId = uuidv4();
  const serviceId = uuidv4();

  const mockService = {
    id: serviceId,
    title: 'Pranic Energy Clearing',
    durationMin: 60,
    priceAmount: 250000, // ₹2,500
    currency: 'INR',
    mode: 'ONLINE',
    cancellationPolicy: 'MODERATE',
    commissionBps: 1500,
  };

  const mockProviderProfile = {
    id: 'prov-prof-e2e',
    userId: providerUserId,
    displayName: 'Dr. Vedant Shastri',
    city: 'Rishikesh',
    country: 'India',
    payoutAccountId: 'acc_rzp_e2e_route_001',
    reliabilityStrikes: 0,
  };

  const mockBooking = {
    id: bookingId,
    consumerId,
    providerId: providerUserId,
    serviceId,
    priceSnapshot: 250000,
    currency: 'INR',
    commissionBps: 1500,
    status: BookingStatus.PENDING_PAYMENT,
    startAt: new Date(Date.now() + 86400000 * 2),
    endAt: new Date(Date.now() + 86400000 * 2 + 3600000),
    service: mockService,
    provider: {
      id: providerUserId,
      providerProfile: mockProviderProfile,
    },
    consumer: {
      id: consumerId,
      email: 'seeker.e2e@example.com',
    },
  };

  const inMemoryPayments: any[] = [];
  const inMemoryProcessedEvents: any[] = [];
  const inMemoryLedgerEntries: any[] = [];
  const inMemoryPayouts: any[] = [];

  let createdOrderId = '';
  let paymentRecordId = '';

  beforeAll(async () => {
    // Mock Prisma storage
    (jest.spyOn(prisma.refreshToken, 'create') as any).mockResolvedValue({ id: 'rt-mock' });
    (jest.spyOn(prisma.auditLog, 'create') as any).mockResolvedValue({ id: 'audit-mock' });
    (jest.spyOn(prisma.notification, 'create') as any).mockResolvedValue({ id: 'notif-mock' });

    (jest.spyOn(prisma.booking, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      if (where.id === bookingId) {
        return {
          ...mockBooking,
          payments: inMemoryPayments.filter((p) => p.bookingId === bookingId),
        };
      }
      return null;
    });

    (jest.spyOn(prisma.booking, 'findFirst') as any).mockImplementation(async () => {
      return {
        ...mockBooking,
        payments: inMemoryPayments.filter((p) => p.bookingId === bookingId),
      };
    });

    (jest.spyOn(prisma.booking, 'findMany') as any).mockImplementation(async ({ where }: any) => {
      if (where.providerId === providerUserId) {
        return [
          {
            ...mockBooking,
            payments: inMemoryPayments.filter((p) => p.bookingId === bookingId),
          },
        ];
      }
      return [];
    });

    (jest.spyOn(prisma.booking, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        if (where.id === bookingId) {
          Object.assign(mockBooking, data);
          return mockBooking;
        }
        return null;
      },
    );

    (jest.spyOn(prisma.providerProfile, 'findUnique') as any).mockImplementation(
      async ({ where }: any) => {
        if (where.userId === providerUserId) return mockProviderProfile;
        return null;
      },
    );

    (jest.spyOn(prisma.payment, 'upsert') as any).mockImplementation(
      async ({ where, create, update }: any) => {
        let p = inMemoryPayments.find((item) => item.gatewayOrderId === where.gatewayOrderId);
        if (!p) {
          p = { id: uuidv4(), ...create, createdAt: new Date() };
          inMemoryPayments.push(p);
        } else {
          Object.assign(p, update);
        }
        paymentRecordId = p.id;
        return p;
      },
    );

    (jest.spyOn(prisma.payment, 'findFirst') as any).mockImplementation(async ({ where }: any) => {
      return (
        inMemoryPayments.find((p) => p.gatewayOrderId === where.gatewayOrderId) ||
        inMemoryPayments[0] ||
        null
      );
    });

    (jest.spyOn(prisma.payment, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      const p = inMemoryPayments.find(
        (item) => item.id === where.id || item.gatewayPaymentId === where.gatewayPaymentId,
      );
      if (!p) return null;
      return {
        ...p,
        booking: {
          ...mockBooking,
          payments: inMemoryPayments,
        },
      };
    });

    (jest.spyOn(prisma.payment, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        const p = inMemoryPayments.find((item) => item.id === where.id);
        if (p) Object.assign(p, data);
        return p;
      },
    );

    (jest.spyOn(prisma.payment, 'create') as any).mockImplementation(async ({ data }: any) => {
      const p = { id: uuidv4(), ...data, createdAt: new Date() };
      inMemoryPayments.push(p);
      return p;
    });

    (jest.spyOn(prisma.session, 'upsert') as any).mockImplementation(
      async ({ create, where }: any) => {
        return { id: uuidv4(), bookingId: where.bookingId, ...create };
      },
    );

    (jest.spyOn(prisma.session, 'findUnique') as any).mockImplementation(async () => null);

    (jest.spyOn(prisma.payment, 'findMany') as any).mockImplementation(
      async () => inMemoryPayments,
    );

    (jest.spyOn(prisma.processedWebhookEvent, 'findUnique') as any).mockImplementation(
      async ({ where }: any) => {
        return inMemoryProcessedEvents.find((e) => e.eventId === where.eventId) || null;
      },
    );

    (jest.spyOn(prisma.processedWebhookEvent, 'create') as any).mockImplementation(
      async ({ data }: any) => {
        const e = { id: uuidv4(), ...data };
        inMemoryProcessedEvents.push(e);
        return e;
      },
    );

    (jest.spyOn(prisma.ledgerEntry, 'create') as any).mockImplementation(async ({ data }: any) => {
      const le = { id: uuidv4(), ...data, createdAt: new Date() };
      inMemoryLedgerEntries.push(le);
      return le;
    });

    (jest.spyOn(prisma.ledgerEntry, 'findMany') as any).mockImplementation(
      async () => inMemoryLedgerEntries,
    );

    (jest.spyOn(prisma.payout, 'findMany') as any).mockImplementation(async () => inMemoryPayouts);

    (jest.spyOn(prisma, '$transaction') as any).mockImplementation(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return Promise.all(callback);
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
      'seeker.e2e@example.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    consumerToken = cTokens.accessToken;

    const pTokens = await tokenService.generateTokens(
      providerUserId,
      'provider.e2e@example.com',
      UserRole.PROVIDER,
      'Asia/Kolkata',
    );
    providerToken = pTokens.accessToken;

    const aTokens = await tokenService.generateTokens(
      adminUserId,
      'admin.e2e@example.com',
      UserRole.ADMIN,
      'Asia/Kolkata',
    );
    adminToken = aTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /payments/orders', () => {
    it('should create Razorpay order strictly using server-side priceSnapshot (₹2,500)', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/orders')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          bookingId,
          // Intentionally attempt to submit custom forged amount; must be ignored by server
          clientAmount: 50,
        })
        .expect(201);

      expect(res.body).toHaveProperty('orderId');
      expect(res.body.orderId).toMatch(/^order_/);
      expect(res.body.amount).toBe(250000); // Server enforced: ₹2,500
      expect(res.body.currency).toBe('INR');
      expect(res.body.taxBreakdown).toBeDefined();
      expect(res.body.taxBreakdown.sacCode).toBe('998399');

      createdOrderId = res.body.orderId;
    });
  });

  describe('POST /payments/verify', () => {
    it('should verify valid HMAC-SHA256 signature, capture payment and write double-entry ledger', async () => {
      const paymentId = 'pay_e2e_signature_1';
      const secret = 'rzp_test_secretKey';

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${createdOrderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app.getHttpServer())
        .post('/payments/verify')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          bookingId,
          razorpayOrderId: createdOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.bookingId).toBe(bookingId);

      // Verify double-entry ledger entries exist
      expect(
        inMemoryLedgerEntries.some(
          (le) =>
            le.accountType === LedgerAccountType.CONSUMER_PAYMENT &&
            le.entryType === LedgerEntryType.DEBIT &&
            le.amount === 250000,
        ),
      ).toBe(true);
    });

    it('should reject invalid signature with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/payments/verify')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          bookingId,
          razorpayOrderId: createdOrderId,
          razorpayPaymentId: 'pay_tampered_1',
          razorpaySignature: 'invalid_forged_hex_signature',
        })
        .expect(400);
    });
  });

  describe('POST /payments/webhook (Idempotent Webhook Processing)', () => {
    it('should process webhook and handle replay idempotently', async () => {
      const rawPayload = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_e2e_replay_test_999',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_hook_e2e',
              order_id: createdOrderId,
              amount: 250000,
              currency: 'INR',
              status: 'captured',
              notes: { bookingId },
            },
          },
        },
      });

      const signature = crypto
        .createHmac('sha256', 'rzp_webhook_secret_default')
        .update(rawPayload)
        .digest('hex');

      // First webhook delivery
      const res1 = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawPayload)
        .expect(200);

      expect(res1.body.status).toBe('ok');
      expect(res1.body.alreadyProcessed).toBe(false);

      const ledgerCountBefore = inMemoryLedgerEntries.length;

      // Duplicate webhook delivery (Replay)
      const res2 = await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawPayload)
        .expect(200);

      expect(res2.body.status).toBe('ok');
      expect(res2.body.alreadyProcessed).toBe(true);

      // Invariant: duplicate delivery did not produce duplicate ledger entries
      expect(inMemoryLedgerEntries.length).toBe(ledgerCountBefore);
    });
  });

  describe('GET /payments/:id/receipt', () => {
    it('should generate compliant binary PDF invoice with GST breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get(`/payments/${paymentRecordId}/receipt`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body).toBeDefined();

      // Check PDF magic header %PDF-1.4
      const pdfHeader = res.body.slice(0, 8).toString('utf-8');
      expect(pdfHeader).toContain('%PDF');
    });
  });

  describe('GET /payments/provider/earnings', () => {
    it('should retrieve practitioner earnings breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/payments/provider/earnings')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('providerId');
      expect(res.body).toHaveProperty('pendingEscrowPaise');
      expect(res.body).toHaveProperty('availableForPayoutPaise');
      expect(res.body).toHaveProperty('paidOutPaise');
      expect(res.body).toHaveProperty('transactions');
      expect(Array.isArray(res.body.transactions)).toBe(true);
    });
  });

  describe('POST /payments/ledger/reconcile', () => {
    it('should audit ledger and verify balance equality', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/ledger/reconcile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      expect(res.body).toHaveProperty('balanced');
      expect(res.body.balanced).toBe(true);
      expect(res.body.discrepancyPaise).toBe(0);
      expect(res.body.totalDebitsPaise).toBe(res.body.totalCreditsPaise);
    });
  });
});
