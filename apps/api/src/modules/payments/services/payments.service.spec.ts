/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { LedgerService } from './ledger.service';
import { EscrowService } from './escrow.service';
import { ReceiptGeneratorService } from './receipt-generator.service';
import { PAYMENT_GATEWAY } from '../interfaces/payment-gateway.interface';
import { RazorpayPaymentGateway } from '../gateways/razorpay-payment.gateway';
import { AuditService } from '../../audit/audit.service';
import { BookingsService } from '../../bookings/services/bookings.service';
import {
  prisma,
  PaymentStatus,
  BookingStatus,
  LedgerEntryType,
  LedgerAccountType,
  PayoutStatus,
} from '@project-nirvana/db';

describe('PaymentsService (Razorpay Orders, Route, Webhook Idempotency, Ledger)', () => {
  let service: PaymentsService;
  let ledgerService: LedgerService;
  let escrowService: EscrowService;
  let bookingsService: BookingsService;

  const consumerId = 'consumer-pay-test-1';
  const providerUserId = 'provider-user-pay-1';
  const providerProfileId = 'provider-profile-pay-1';
  const bookingId = 'booking-pay-test-1';

  const mockBooking = {
    id: bookingId,
    consumerId,
    providerId: providerUserId,
    serviceId: 'service-1',
    priceSnapshot: 200000, // ₹2,000
    currency: 'INR',
    commissionBps: 1500, // 15%
    status: BookingStatus.PENDING_PAYMENT as BookingStatus,
    startAt: new Date(Date.now() + 86400000 * 2),
    endAt: new Date(Date.now() + 86400000 * 2 + 3600000),
    service: {
      id: 'service-1',
      title: 'Vedic Sound Healing',
      durationMin: 60,
      mode: 'ONLINE',
      cancellationPolicy: 'MODERATE',
    },
    provider: {
      id: providerUserId,
      providerProfile: {
        id: providerProfileId,
        displayName: 'Guruji Vedavyas',
        payoutAccountId: 'acc_test_route_123',
        reliabilityStrikes: 0,
        city: 'Rishikesh',
        country: 'India',
      },
    },
    consumer: {
      id: consumerId,
      email: 'seeker@example.com',
    },
    payments: [] as any[],
  };

  const inMemoryPayments: any[] = [];
  const inMemoryProcessedEvents: any[] = [];
  const inMemoryLedgerEntries: any[] = [];
  const inMemoryPayouts: any[] = [];

  beforeEach(async () => {
    inMemoryPayments.length = 0;
    inMemoryProcessedEvents.length = 0;
    inMemoryLedgerEntries.length = 0;
    inMemoryPayouts.length = 0;
    mockBooking.status = BookingStatus.PENDING_PAYMENT;
    mockBooking.payments = [];

    // Mock Prisma methods
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

    (jest.spyOn(prisma.booking, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        if (where.id === bookingId) {
          Object.assign(mockBooking, data);
          return mockBooking;
        }
        return null;
      },
    );

    (jest.spyOn(prisma.payment, 'upsert') as any).mockImplementation(
      async ({ where, create, update }: any) => {
        let p = inMemoryPayments.find((item) => item.gatewayOrderId === where.gatewayOrderId);
        if (!p) {
          p = { id: `pay-${Date.now()}`, ...create, createdAt: new Date() };
          inMemoryPayments.push(p);
        } else {
          Object.assign(p, update);
        }
        return p;
      },
    );

    (jest.spyOn(prisma.payment, 'findFirst') as any).mockImplementation(async ({ where }: any) => {
      return (
        inMemoryPayments.find(
          (p) => p.gatewayOrderId === where.gatewayOrderId || p.bookingId === where.bookingId,
        ) || null
      );
    });

    (jest.spyOn(prisma.payment, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      return (
        inMemoryPayments.find(
          (p) => p.id === where.id || p.gatewayPaymentId === where.gatewayPaymentId,
        ) || null
      );
    });

    (jest.spyOn(prisma.payment, 'create') as any).mockImplementation(async ({ data }: any) => {
      const p = { id: `pay-${Date.now()}`, ...data, createdAt: new Date() };
      inMemoryPayments.push(p);
      return p;
    });

    (jest.spyOn(prisma.payment, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        const p = inMemoryPayments.find((item) => item.id === where.id);
        if (p) {
          const updateData = { ...data };
          if (data.refundedAmount?.increment) {
            updateData.refundedAmount = (p.refundedAmount || 0) + data.refundedAmount.increment;
          }
          Object.assign(p, updateData);
        }
        return p;
      },
    );

    (jest.spyOn(prisma.payment, 'updateMany') as any).mockImplementation(
      async ({ where, data }: any) => {
        let count = 0;
        for (const p of inMemoryPayments) {
          if (where.gatewayOrderId && p.gatewayOrderId === where.gatewayOrderId) {
            Object.assign(p, data);
            count++;
          }
        }
        return { count };
      },
    );

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
        const e = { id: `ev-${Date.now()}`, ...data };
        inMemoryProcessedEvents.push(e);
        return e;
      },
    );

    (jest.spyOn(prisma.ledgerEntry, 'create') as any).mockImplementation(async ({ data }: any) => {
      const le = { id: `le-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
      inMemoryLedgerEntries.push(le);
      return le;
    });

    (jest.spyOn(prisma.ledgerEntry, 'findMany') as any).mockImplementation(
      async () => inMemoryLedgerEntries,
    );

    (jest.spyOn(prisma.ledgerEntry, 'updateMany') as any).mockImplementation(async () => ({
      count: 1,
    }));

    (jest.spyOn(prisma.payout, 'create') as any).mockImplementation(async ({ data }: any) => {
      const po = { id: `payout-${Date.now()}`, ...data, createdAt: new Date() };
      inMemoryPayouts.push(po);
      return po;
    });

    (jest.spyOn(prisma.payout, 'findMany') as any).mockImplementation(async () =>
      inMemoryPayouts.map((po) => ({
        ...po,
        provider: {
          id: po.providerId,
          payoutAccountId: 'acc_test_route_123',
        },
        ledgerEntries: inMemoryLedgerEntries.filter((le) => le.payoutId === po.id),
      })),
    );

    (jest.spyOn(prisma.payout, 'findFirst') as any).mockImplementation(
      async () => inMemoryPayouts[0] || null,
    );

    (jest.spyOn(prisma.payout, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        const po = inMemoryPayouts.find((p) => p.id === where.id);
        if (po) Object.assign(po, data);
        return po;
      },
    );

    (jest.spyOn(prisma.payout, 'updateMany') as any).mockImplementation(async () => ({ count: 1 }));

    (jest.spyOn(prisma, '$transaction') as any).mockImplementation(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return Promise.all(callback);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        LedgerService,
        EscrowService,
        ReceiptGeneratorService,
        RazorpayPaymentGateway,
        {
          provide: PAYMENT_GATEWAY,
          useClass: RazorpayPaymentGateway,
        },
        {
          provide: AuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: BookingsService,
          useValue: {
            handlePaymentWebhook: jest.fn().mockImplementation(async (dto: any) => {
              if (dto.status === 'captured') {
                mockBooking.status = BookingStatus.CONFIRMED;
              } else if (dto.status === 'failed') {
                mockBooking.status = BookingStatus.CANCELLED_BY_CONSUMER;
              }
              return { status: mockBooking.status, alreadyProcessed: false };
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    ledgerService = module.get<LedgerService>(LedgerService);
    escrowService = module.get<EscrowService>(EscrowService);
    bookingsService = module.get<BookingsService>(BookingsService);
  });

  describe('1. Server-Side Price Snapshot Order Creation', () => {
    it('should create an order strictly using booking.priceSnapshot (never taking amount from client)', async () => {
      const order = await service.createPaymentOrder(consumerId, bookingId);

      expect(order).toBeDefined();
      expect(order.orderId).toMatch(/^order_/);
      expect(order.amount).toBe(200000); // Exactly ₹2,000 from DB snapshot
      expect(order.currency).toBe('INR');
      expect(order.taxBreakdown).toBeDefined();
      expect(order.taxBreakdown.baseAmount + order.taxBreakdown.totalTax).toBe(200000);

      // Verify payment was created in DB in PENDING status
      expect(inMemoryPayments.length).toBe(1);
      expect(inMemoryPayments[0].status).toBe(PaymentStatus.PENDING);
      expect(inMemoryPayments[0].amount).toBe(200000);
    });

    it('should reject order creation if user is not the booking consumer', async () => {
      await expect(service.createPaymentOrder('unauthorized-user', bookingId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject order creation if booking is already confirmed', async () => {
      mockBooking.status = BookingStatus.CONFIRMED;
      await expect(service.createPaymentOrder(consumerId, bookingId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('2. Checkout Signature Verification', () => {
    it('should verify valid HMAC-SHA256 signature, capture payment, and write double-entry ledger', async () => {
      const orderId = 'order_test_12345';
      const paymentId = 'pay_test_98765';
      const secret = 'rzp_test_secretKey';

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const result = await service.verifyPaymentSignature(consumerId, {
        bookingId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      });

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe(bookingId);

      // Verify payment captured in DB
      expect(inMemoryPayments.some((p) => p.status === PaymentStatus.CAPTURED)).toBe(true);

      // Verify double-entry ledger: Debit CONSUMER_PAYMENT, Credit PLATFORM_ESCROW
      const debits = inMemoryLedgerEntries.filter(
        (le) =>
          le.entryType === LedgerEntryType.DEBIT &&
          le.accountType === LedgerAccountType.CONSUMER_PAYMENT,
      );
      const credits = inMemoryLedgerEntries.filter(
        (le) =>
          le.entryType === LedgerEntryType.CREDIT &&
          le.accountType === LedgerAccountType.PLATFORM_ESCROW,
      );
      expect(debits.length).toBe(1);
      expect(credits.length).toBe(1);
      expect(debits[0].amount).toBe(200000);
      expect(credits[0].amount).toBe(200000);

      // Verify booking webhook confirmation called
      expect(bookingsService.handlePaymentWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'captured',
          bookingId,
          paymentId,
        }),
      );
    });

    it('should reject forged or tampered signatures with BadRequestException', async () => {
      await expect(
        service.verifyPaymentSignature(consumerId, {
          bookingId,
          razorpayOrderId: 'order_test_12345',
          razorpayPaymentId: 'pay_test_98765',
          razorpaySignature: 'forged_invalid_signature_hex',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Webhook Replay & Idempotency', () => {
    it('should handle duplicate webhook delivery idempotently without duplicating ledger records', async () => {
      const rawPayload = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_unique_101',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_hook_1',
              order_id: 'order_hook_1',
              amount: 200000,
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
      const res1 = await service.handleWebhook(rawPayload, signature, JSON.parse(rawPayload));
      expect(res1.success).toBe(true);
      expect(res1.alreadyProcessed).toBe(false);

      const initialLedgerCount = inMemoryLedgerEntries.length;
      expect(initialLedgerCount).toBe(2); // 1 Debit, 1 Credit

      // Second identical webhook delivery (Replay)
      const res2 = await service.handleWebhook(rawPayload, signature, JSON.parse(rawPayload));
      expect(res2.success).toBe(true);
      expect(res2.alreadyProcessed).toBe(true);

      // INVARIANT: Ledger count must NOT increase on duplicate replay!
      expect(inMemoryLedgerEntries.length).toBe(initialLedgerCount);
    });
  });

  describe('4. Out-of-Order Webhook Delivery', () => {
    it('should handle payment.failed webhook gracefully even if received without prior order', async () => {
      const rawPayload = JSON.stringify({
        event: 'payment.failed',
        id: 'evt_fail_202',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_99',
              order_id: 'order_unknown_fail',
              status: 'failed',
            },
          },
        },
      });

      const signature = crypto
        .createHmac('sha256', 'rzp_webhook_secret_default')
        .update(rawPayload)
        .digest('hex');

      const res = await service.handleWebhook(rawPayload, signature, JSON.parse(rawPayload));
      expect(res.success).toBe(true);
      expect(inMemoryProcessedEvents.some((e) => e.eventId === 'evt_fail_202')).toBe(true);
    });
  });

  describe('5. Admin-Initiated Refunds', () => {
    it('should process full and partial admin refunds and record double-entry entries', async () => {
      const payment = {
        id: 'pay-captured-1',
        bookingId,
        gatewayPaymentId: 'pay_captured_rzp_1',
        amount: 200000,
        refundedAmount: 0,
        currency: 'INR',
        status: PaymentStatus.CAPTURED,
      };
      inMemoryPayments.push(payment);

      // Issue partial refund of ₹1,000 (100,000 paise)
      const result = await service.processAdminRefund('admin-user-1', {
        paymentId: payment.id,
        amountPaise: 100000,
        reason: 'Client dispute resolved in customer favor',
      });

      expect(result.refundId).toMatch(/^rfnd_/);
      expect(result.amountRefunded).toBe(100000);
      expect(payment.refundedAmount).toBe(100000);

      // Verify refund ledger entries: Debit PLATFORM_ESCROW, Credit REFUND_ESCROW
      const refundDebits = inMemoryLedgerEntries.filter(
        (le) =>
          le.entryType === LedgerEntryType.DEBIT &&
          le.accountType === LedgerAccountType.PLATFORM_ESCROW,
      );
      const refundCredits = inMemoryLedgerEntries.filter(
        (le) =>
          le.entryType === LedgerEntryType.CREDIT &&
          le.accountType === LedgerAccountType.REFUND_ESCROW,
      );

      expect(refundDebits.some((e) => e.amount === 100000)).toBe(true);
      expect(refundCredits.some((e) => e.amount === 100000)).toBe(true);
    });
  });

  describe('6. Escrow Hold Release & Daily Reconciliation', () => {
    it('should schedule escrow release on booking completed and release Route payout', async () => {
      // Setup captured payment
      inMemoryPayments.push({
        id: 'pay-escrow-1',
        bookingId,
        amount: 200000,
        refundedAmount: 0,
        currency: 'INR',
        status: PaymentStatus.CAPTURED,
      });

      // Execute escrow release
      await escrowService.scheduleEscrowRelease(bookingId);

      // Check pending payout created
      expect(inMemoryPayouts.length).toBe(1);
      const payout = inMemoryPayouts[0];
      expect(payout.amount).toBe(170000); // ₹1,700 (85% of ₹2,000)

      // Test process due payouts
      payout.scheduledFor = new Date(Date.now() - 1000); // mature hold period
      const processedCount = await escrowService.processDuePayouts();
      expect(processedCount).toBe(1);
      expect(payout.status).toBe(PayoutStatus.PAID);
      expect(payout.gatewayTransferId).toMatch(/^trf_/);
    });

    it('should verify that reconciliation job confirms a balanced double-entry ledger', async () => {
      // Simulate matching customer payment and escrow release
      const amount = 200000;
      await ledgerService.recordCustomerPayment(bookingId, amount, 'INR');

      const reconciliation = await ledgerService.reconcileLedger();
      expect(reconciliation.balanced).toBe(true);
      expect(reconciliation.discrepancyPaise).toBe(0);
      expect(reconciliation.totalDebitsPaise).toBe(reconciliation.totalCreditsPaise);
    });
  });
});
