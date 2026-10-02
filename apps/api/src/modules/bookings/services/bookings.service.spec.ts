/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BookingsService } from './bookings.service';
import { RedisLockService } from './redis-lock.service';
import { BookingQueueService } from './booking-queue.service';
import { AuditService } from '../../audit/audit.service';

describe('BookingsService (Concurrency, Lifecycle & Concurrency Safety)', () => {
  let service: BookingsService;

  // In-memory mock DB tables
  const dbBookings: any[] = [];
  const dbServices: any[] = [];
  const dbProviderProfiles: any[] = [];
  const dbPayments: any[] = [];
  const dbSessions: any[] = [];

  const mockPrisma = {
    service: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(dbServices.find((s) => s.id === where.id) || null);
      }),
    },
    booking: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = dbBookings.find((b) => b.id === where.id);
        if (!found) return Promise.resolve(null);
        return Promise.resolve({
          ...found,
          service: dbServices.find((s) => s.id === found.serviceId),
          provider: {
            id: found.providerId,
            providerProfile: dbProviderProfiles.find((p) => p.userId === found.providerId),
          },
          consumer: { id: found.consumerId, email: 'client@example.com' },
          payments: dbPayments.filter((p) => p.bookingId === found.id),
          session: dbSessions.find((s) => s.bookingId === found.id) || null,
        });
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          dbBookings
            .filter((b) => {
              if (where.providerId && b.providerId !== where.providerId) return false;
              if (where.consumerId && b.consumerId !== where.consumerId) return false;
              if (where.status?.in && !where.status.in.includes(b.status)) return false;
              return true;
            })
            .map((b) => ({
              ...b,
              service: dbServices.find((s) => s.id === b.serviceId),
              provider: {
                id: b.providerId,
                providerProfile: dbProviderProfiles.find((p) => p.userId === b.providerId),
              },
              consumer: { id: b.consumerId, email: 'client@example.com' },
            })),
        );
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const found = dbBookings.find((b) => {
          if (where.id?.not && b.id === where.id.not) return false;
          if (where.providerId && b.providerId !== where.providerId) return false;
          if (where.status?.in && !where.status.in.includes(b.status)) return false;
          return true;
        });
        return Promise.resolve(found || null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newBooking = {
          id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dbBookings.push(newBooking);
        return Promise.resolve({
          ...newBooking,
          service: dbServices.find((s) => s.id === data.serviceId),
          provider: {
            id: data.providerId,
            providerProfile: dbProviderProfiles.find((p) => p.userId === data.providerId),
          },
          consumer: { id: data.consumerId, email: 'client@example.com' },
        });
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = dbBookings.findIndex((b) => b.id === where.id);
        if (idx === -1) throw new Error('Booking not found');
        const count = data.rescheduledCount?.increment
          ? (dbBookings[idx].rescheduledCount || 0) + data.rescheduledCount.increment
          : data.rescheduledCount !== undefined
            ? data.rescheduledCount
            : dbBookings[idx].rescheduledCount;
        const updated = {
          ...dbBookings[idx],
          ...data,
          rescheduledCount: count,
          updatedAt: new Date(),
        };
        dbBookings[idx] = updated;
        return Promise.resolve({
          ...updated,
          service: dbServices.find((s) => s.id === updated.serviceId),
          provider: {
            id: updated.providerId,
            providerProfile: dbProviderProfiles.find((p) => p.userId === updated.providerId),
          },
          consumer: { id: updated.consumerId, email: 'client@example.com' },
        });
      }),
    },
    payment: {
      create: jest.fn().mockImplementation(({ data }) => {
        const payment = { id: `pay-${Date.now()}`, ...data, createdAt: new Date() };
        dbPayments.push(payment);
        return Promise.resolve(payment);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const p = dbPayments.find((pay) => pay.id === where.id);
        if (p) Object.assign(p, data);
        return Promise.resolve(p);
      }),
    },
    session: {
      upsert: jest.fn().mockImplementation(({ where, create, update }) => {
        let s = dbSessions.find((sess) => sess.bookingId === where.bookingId);
        if (!s) {
          s = { id: `sess-${Date.now()}`, ...create };
          dbSessions.push(s);
        } else {
          Object.assign(s, update);
        }
        return Promise.resolve(s);
      }),
    },
    providerProfile: {
      update: jest.fn().mockImplementation(({ where, data }) => {
        const p = dbProviderProfiles.find((profile) => profile.userId === where.userId);
        if (p) {
          if (data.reliabilityStrikes?.increment) {
            p.reliabilityStrikes = (p.reliabilityStrikes || 0) + data.reliabilityStrikes.increment;
          }
          if (data.completedSessions?.increment) {
            p.completedSessions = (p.completedSessions || 0) + data.completedSessions.increment;
          }
        }
        return Promise.resolve(p);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callbackOrArray) => {
      if (typeof callbackOrArray === 'function') {
        return await callbackOrArray(mockPrisma);
      }
      return await Promise.all(callbackOrArray);
    }),
  };

  beforeEach(async () => {
    dbBookings.length = 0;
    dbServices.length = 0;
    dbProviderProfiles.length = 0;
    dbPayments.length = 0;
    dbSessions.length = 0;

    // Seed mock provider and service
    const mockProvider = {
      id: 'prov-prof-1',
      userId: 'user-prov-1',
      displayName: 'Yogi Anand',
      slug: 'yogi-anand',
      headline: 'Himalayan Yoga & Meditation Master',
      minNoticeHours: 2,
      reliabilityStrikes: 0,
      completedSessions: 12,
      ratingAvg: 4.95,
      ratingCount: 48,
      city: 'Rishikesh',
      country: 'IN',
    };
    dbProviderProfiles.push(mockProvider);

    const mockService = {
      id: 'serv-1',
      providerId: 'user-prov-1',
      title: 'Pranayama & Breathwork Session',
      durationMin: 60,
      priceAmount: 150000, // ₹1,500
      currency: 'INR',
      isActive: true,
      mode: 'ONLINE',
      cancellationPolicy: 'MODERATE',
      category: { commissionBps: 1500 },
      provider: {
        id: 'prov-prof-1',
        userId: 'user-prov-1',
        minNoticeHours: 2,
        user: { id: 'user-prov-1' },
      },
    };
    dbServices.push(mockService);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        RedisLockService,
        {
          provide: BookingQueueService,
          useValue: {
            scheduleSlotLockExpiry: jest.fn().mockResolvedValue(undefined),
            cancelSlotLockExpiry: jest.fn().mockResolvedValue(undefined),
            scheduleSessionCompletion: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: 'PRISMA_CLIENT',
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('Concurrency Race Condition (Two consumers racing for the exact same slot)', () => {
    it('should allow exactly ONE consumer to win and reject the second with 409 Conflict', async () => {
      const slotStartAt = DateTime.utc().plus({ days: 2, hours: 10 }).toISO()!;

      // Concurrently launch two booking requests for the exact same provider slot
      const [res1, res2] = await Promise.allSettled([
        service.createBooking('consumer-1', {
          serviceId: 'serv-1',
          startAt: slotStartAt,
          notes: 'Consumer 1 request',
        }),
        service.createBooking('consumer-2', {
          serviceId: 'serv-1',
          startAt: slotStartAt,
          notes: 'Consumer 2 request',
        }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and exactly ONE must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Successful winner receives PENDING_PAYMENT booking
      const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(winner.status).toBe('PENDING_PAYMENT');
      expect(winner.slotLockExpiresAt).toBeDefined();
      expect(winner.lockRemainingSeconds).toBeGreaterThan(0);

      // Loser receives ConflictException (409)
      const error = (rejected[0] as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(ConflictException);

      // Database contains only ONE booking for that slot
      expect(dbBookings).toHaveLength(1);
      expect(dbBookings[0].consumerId).toBe(winner.consumerId);
    });
  });

  describe('Expired Locks Reclamation', () => {
    it('should release an expired lock and allow a new consumer to book the slot', async () => {
      const slotStart = DateTime.utc().plus({ days: 3, hours: 14 });
      const slotStartIso = slotStart.toISO()!;

      // Create an existing booking whose 10-minute lock expired 5 minutes ago
      dbBookings.push({
        id: 'book-expired-lock',
        consumerId: 'consumer-stale',
        providerId: 'user-prov-1',
        serviceId: 'serv-1',
        startAt: slotStart.toJSDate(),
        endAt: slotStart.plus({ minutes: 60 }).toJSDate(),
        status: 'PENDING_PAYMENT',
        priceSnapshot: 150000,
        currency: 'INR',
        commissionBps: 1500,
        slotLockExpiresAt: DateTime.utc().minus({ minutes: 5 }).toJSDate(), // EXPIRED!
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // New consumer attempts to book this same slot
      const newBooking = await service.createBooking('consumer-new', {
        serviceId: 'serv-1',
        startAt: slotStartIso,
        notes: 'Reclaiming slot after expired lock',
      });

      expect(newBooking).toBeDefined();
      expect(newBooking.consumerId).toBe('consumer-new');
      expect(newBooking.status).toBe('PENDING_PAYMENT');

      // The stale booking should have been transitioned to CANCELLED
      const staleBooking = dbBookings.find((b) => b.id === 'book-expired-lock');
      expect(staleBooking.status).toBe('CANCELLED_BY_CONSUMER');
      expect(staleBooking.refundReason).toContain('Reservation lock expired');
    });
  });

  describe('Payment Webhook Idempotency (Duplicate Webhook Delivery)', () => {
    it('should confirm booking and handle duplicate webhook deliveries gracefully without double execution', async () => {
      const slotStart = DateTime.utc().plus({ days: 4, hours: 10 });

      // Create a PENDING_PAYMENT booking
      const booking = await service.createBooking('consumer-webhook-test', {
        serviceId: 'serv-1',
        startAt: slotStart.toISO()!,
      });

      const paymentDto = {
        event: 'payment.captured',
        bookingId: booking.id,
        paymentId: 'pay_rzp_123456789',
        amount: 150000,
        status: 'captured' as const,
      };

      // First webhook delivery
      const firstResult = await service.handlePaymentWebhook(paymentDto);
      expect(firstResult.status).toBe('CONFIRMED');
      expect(firstResult.alreadyProcessed).toBe(false);

      // Verify booking is now CONFIRMED and slot lock is cleared
      const updatedBooking = dbBookings.find((b) => b.id === booking.id);
      expect(updatedBooking.status).toBe('CONFIRMED');
      expect(updatedBooking.slotLockExpiresAt).toBeNull();
      expect(dbPayments).toHaveLength(1);

      // SECOND (duplicate) webhook delivery with identical payment payload
      const secondResult = await service.handlePaymentWebhook(paymentDto);
      expect(secondResult.status).toBe('CONFIRMED');
      expect(secondResult.alreadyProcessed).toBe(true);

      // Third duplicate webhook delivery
      const thirdResult = await service.handlePaymentWebhook(paymentDto);
      expect(thirdResult.status).toBe('CONFIRMED');
      expect(thirdResult.alreadyProcessed).toBe(true);

      // Payment records and sessions are not duplicated
      expect(dbPayments).toHaveLength(1);
    });

    it('should cancel booking on payment failure webhook', async () => {
      const slotStart = DateTime.utc().plus({ days: 4, hours: 16 });

      const booking = await service.createBooking('consumer-fail-test', {
        serviceId: 'serv-1',
        startAt: slotStart.toISO()!,
      });

      const failedDto = {
        event: 'payment.failed',
        bookingId: booking.id,
        paymentId: 'pay_failed_999',
        status: 'failed' as const,
      };

      const result = await service.handlePaymentWebhook(failedDto);
      expect(result.status).toBe('CANCELLED_BY_CONSUMER');

      const cancelledBooking = dbBookings.find((b) => b.id === booking.id);
      expect(cancelledBooking.status).toBe('CANCELLED_BY_CONSUMER');
      expect(cancelledBooking.refundReason).toContain('Payment attempt failed');
    });
  });

  describe('Rescheduling Flow', () => {
    it('should reschedule appointment, re-validate availability, and preserve payment', async () => {
      const originalStart = DateTime.utc().plus({ days: 5, hours: 10 });
      const newStart = DateTime.utc().plus({ days: 6, hours: 11 });

      const booking = await service.createBooking('consumer-resched', {
        serviceId: 'serv-1',
        startAt: originalStart.toISO()!,
      });

      // Confirm payment
      await service.handlePaymentWebhook({
        event: 'payment.captured',
        bookingId: booking.id,
        paymentId: 'pay_resched_1',
        status: 'captured',
      });

      // Reschedule
      const rescheduled = await service.rescheduleBooking(booking.id, 'consumer-resched', {
        newStartAt: newStart.toISO()!,
        reason: 'Schedule conflict',
      });

      expect(rescheduled.startAt).toBe(newStart.toISO()!);
      expect(rescheduled.rescheduledCount).toBe(1);
      expect(rescheduled.status).toBe('CONFIRMED');
    });

    it('should throw BadRequestException if rescheduling outside policy window', async () => {
      // Create confirmed booking with STRICT policy less than 48 hours away
      const strictService = {
        ...dbServices[0],
        id: 'serv-strict',
        cancellationPolicy: 'STRICT',
      };
      dbServices.push(strictService);

      const imminentStart = DateTime.utc().plus({ hours: 24 }); // Only 24h away (STRICT requires 48h)
      const booking = await service.createBooking('consumer-strict', {
        serviceId: 'serv-strict',
        startAt: imminentStart.toISO()!,
      });

      await service.handlePaymentWebhook({
        event: 'payment.captured',
        bookingId: booking.id,
        paymentId: 'pay_strict_1',
        status: 'captured',
      });

      await expect(
        service.rescheduleBooking(booking.id, 'consumer-strict', {
          newStartAt: DateTime.utc().plus({ days: 10 }).toISO()!,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Cancellation Flow & Reliability Strike', () => {
    it('should refund 100% and record a reliability strike when provider cancels', async () => {
      const startAt = DateTime.utc().plus({ days: 3, hours: 10 });

      const booking = await service.createBooking('consumer-prov-cancel', {
        serviceId: 'serv-1',
        startAt: startAt.toISO()!,
      });

      await service.handlePaymentWebhook({
        event: 'payment.captured',
        bookingId: booking.id,
        paymentId: 'pay_strike_test',
        status: 'captured',
      });

      const initialStrikes = dbProviderProfiles[0].reliabilityStrikes || 0;

      // Provider cancels appointment
      const result = await service.cancelBooking(
        booking.id,
        'user-prov-1', // Provider ID
        'Emergency personal issue',
      );

      expect(result.booking.status).toBe('CANCELLED_BY_PROVIDER');
      expect(result.refund.refundPercentage).toBe(100);
      expect(result.refund.refundPaise).toBe(150000);

      // Verify provider profile reliability strike was recorded
      expect(dbProviderProfiles[0].reliabilityStrikes).toBe(initialStrikes + 1);
    });

    it('should compute partial refund when consumer cancels per MODERATE policy within 24h', async () => {
      const imminentStart = DateTime.utc().plus({ hours: 12 }); // 12 hours prior

      const booking = await service.createBooking('consumer-mod-cancel', {
        serviceId: 'serv-1',
        startAt: imminentStart.toISO()!,
      });

      await service.handlePaymentWebhook({
        event: 'payment.captured',
        bookingId: booking.id,
        paymentId: 'pay_mod_test',
        status: 'captured',
      });

      // Consumer cancels within 24h under MODERATE policy -> 50% refund
      const result = await service.cancelBooking(
        booking.id,
        'consumer-mod-cancel',
        'Changed plans',
      );

      expect(result.booking.status).toBe('CANCELLED_BY_CONSUMER');
      expect(result.refund.refundPercentage).toBe(50);
      expect(result.refund.refundPaise).toBe(75000);
      expect(result.refund.refundRupees).toBe(750);
    });
  });

  describe('Session Completion and Attendance Verification', () => {
    it('should complete session and increment completedSessions when both attend', async () => {
      const pastStart = DateTime.utc().minus({ hours: 2 });
      const pastEnd = pastStart.plus({ minutes: 60 });

      dbBookings.push({
        id: 'book-completed-test',
        consumerId: 'consumer-attend',
        providerId: 'user-prov-1',
        serviceId: 'serv-1',
        startAt: pastStart.toJSDate(),
        endAt: pastEnd.toJSDate(),
        status: 'CONFIRMED',
        priceSnapshot: 150000,
        currency: 'INR',
        commissionBps: 1500,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Record attendance for both
      dbSessions.push({
        bookingId: 'book-completed-test',
        videoRoomName: 'room-test',
        joinedByConsumerAt: pastStart.plus({ minutes: 1 }).toJSDate(),
        joinedByProviderAt: pastStart.plus({ minutes: 2 }).toJSDate(),
      });

      const initialSessions = dbProviderProfiles[0].completedSessions || 0;

      await service.handleSessionCompletion('book-completed-test');

      const completed = dbBookings.find((b) => b.id === 'book-completed-test');
      expect(completed.status).toBe('COMPLETED');
      expect(dbProviderProfiles[0].completedSessions).toBe(initialSessions + 1);
    });

    it('should record PROVIDER_NO_SHOW, 100% refund, and strike if provider misses session', async () => {
      const pastStart = DateTime.utc().minus({ hours: 2 });

      dbBookings.push({
        id: 'book-noshow-test',
        consumerId: 'consumer-waiting',
        providerId: 'user-prov-1',
        serviceId: 'serv-1',
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ minutes: 60 }).toJSDate(),
        status: 'CONFIRMED',
        priceSnapshot: 150000,
        currency: 'INR',
        commissionBps: 1500,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Consumer joined, but provider never did
      dbSessions.push({
        bookingId: 'book-noshow-test',
        videoRoomName: 'room-test',
        joinedByConsumerAt: pastStart.plus({ minutes: 2 }).toJSDate(),
        joinedByProviderAt: null,
      });

      const initialStrikes = dbProviderProfiles[0].reliabilityStrikes || 0;

      await service.handleSessionCompletion('book-noshow-test');

      const booking = dbBookings.find((b) => b.id === 'book-noshow-test');
      expect(booking.status).toBe('NO_SHOW_PROVIDER');
      expect(booking.refundAmount).toBe(150000);
      expect(dbProviderProfiles[0].reliabilityStrikes).toBe(initialStrikes + 1);
    });
  });
});
