import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import { getEnvConfig } from '../../../config/env.config';

export interface SlotLockExpiryPayload {
  bookingId: string;
}

export interface SessionCompletionPayload {
  bookingId: string;
}

@Injectable()
export class BookingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingQueueService.name);
  private expiryQueue: Queue | null = null;
  private expiryWorker: Worker | null = null;
  private completionQueue: Queue | null = null;
  private completionWorker: Worker | null = null;

  // In-memory fallback timers for testing and offline Redis
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit(): Promise<void> {
    const env = getEnvConfig();

    let isRedisAlive = false;
    try {
      const probe = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        connectTimeout: 500,
        lazyConnect: true,
      });
      await probe.connect();
      await probe.ping();
      probe.disconnect();
      isRedisAlive = true;
    } catch {
      this.logger.warn(
        `Redis unavailable at ${env.REDIS_URL}. BullMQ will use in-memory timer fallback.`,
      );
    }

    if (!isRedisAlive) {
      this.expiryQueue = null;
      this.completionQueue = null;
      return;
    }

    try {
      const redisConnection = {
        url: env.REDIS_URL,
        maxRetriesPerRequest: null,
      } as unknown as ConnectionOptions;

      this.expiryQueue = new Queue('booking-lock-expiry', {
        connection: redisConnection,
      });

      this.completionQueue = new Queue('booking-session-completion', {
        connection: redisConnection,
      });

      this.expiryQueue.on('error', (err) => {
        this.logger.warn(`BullMQ expiryQueue error: ${err.message}`);
      });
      this.completionQueue.on('error', (err) => {
        this.logger.warn(`BullMQ completionQueue error: ${err.message}`);
      });

      this.expiryWorker = new Worker(
        'booking-lock-expiry',
        async (job: Job<SlotLockExpiryPayload>) => {
          await this.processLockExpiry(job.data.bookingId);
        },
        { connection: redisConnection },
      );

      this.completionWorker = new Worker(
        'booking-session-completion',
        async (job: Job<SessionCompletionPayload>) => {
          await this.processSessionCompletion(job.data.bookingId);
        },
        { connection: redisConnection },
      );

      this.expiryWorker.on('error', (err) => {
        this.logger.warn(`BullMQ expiryWorker error (using in-memory fallback): ${err.message}`);
      });
      this.completionWorker.on('error', (err) => {
        this.logger.warn(
          `BullMQ completionWorker error (using in-memory fallback): ${err.message}`,
        );
      });
    } catch {
      this.logger.warn('Failed to connect BullMQ to Redis, using in-memory timer fallback');
      this.expiryQueue = null;
      this.completionQueue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Clear all in-memory fallback timers
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();

    if (this.expiryWorker) await this.expiryWorker.close();
    if (this.expiryQueue) await this.expiryQueue.close();
    if (this.completionWorker) await this.completionWorker.close();
    if (this.completionQueue) await this.completionQueue.close();
  }

  /**
   * Schedule slot lock expiration job (default 10 minutes)
   */
  async scheduleSlotLockExpiry(bookingId: string, delayMs: number = 600000): Promise<void> {
    const jobId = `lock-expiry:${bookingId}`;

    if (this.expiryQueue) {
      try {
        await this.expiryQueue.add(
          'expire-lock',
          { bookingId },
          { delay: delayMs, jobId, removeOnComplete: true },
        );
        this.logger.log(
          `BullMQ delayed job scheduled for booking ${bookingId} in ${delayMs / 1000}s`,
        );
        return;
      } catch (err) {
        this.logger.warn(`BullMQ add failed, using in-memory timer: ${(err as Error).message}`);
      }
    }

    // In-memory timer fallback
    this.cancelSlotLockExpiry(bookingId);
    const timer = setTimeout(async () => {
      this.activeTimers.delete(jobId);
      await this.processLockExpiry(bookingId);
    }, delayMs);
    this.activeTimers.set(jobId, timer);
  }

  /**
   * Cancel scheduled slot lock expiration (e.g. upon payment confirmation)
   */
  async cancelSlotLockExpiry(bookingId: string): Promise<void> {
    const jobId = `lock-expiry:${bookingId}`;

    if (this.expiryQueue) {
      try {
        const job = await this.expiryQueue.getJob(jobId);
        if (job) {
          await job.remove();
        }
      } catch {
        // Ignore removal error
      }
    }

    const timer = this.activeTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(jobId);
    }
  }

  /**
   * Schedule session completion verification job after session endAt
   */
  async scheduleSessionCompletion(bookingId: string, delayMs: number): Promise<void> {
    const jobId = `completion:${bookingId}`;
    const safeDelay = Math.max(0, delayMs);

    if (this.completionQueue) {
      try {
        await this.completionQueue.add(
          'verify-completion',
          { bookingId },
          { delay: safeDelay, jobId, removeOnComplete: true },
        );
        return;
      } catch {
        // Fall back to in-memory
      }
    }

    const timer = setTimeout(async () => {
      this.activeTimers.delete(jobId);
      await this.processSessionCompletion(bookingId);
    }, safeDelay);
    this.activeTimers.set(jobId, timer);
  }

  /**
   * Processor: Executes lock expiry if booking is still in PENDING_PAYMENT
   */
  async processLockExpiry(bookingId: string): Promise<void> {
    try {
      this.logger.log(`Processing slot lock expiry for booking ${bookingId}...`);
      this.eventEmitter.emit('booking.internal.lock_expired', { bookingId });
    } catch (err: unknown) {
      this.logger.error(`Error processing lock expiry for booking ${bookingId}:`, err);
    }
  }

  /**
   * Processor: Handles post-session completion and no-show determinations
   */
  async processSessionCompletion(bookingId: string): Promise<void> {
    try {
      this.logger.log(`Processing session completion evaluation for booking ${bookingId}...`);
      this.eventEmitter.emit('booking.internal.session_completed', { bookingId });
    } catch (err: unknown) {
      this.logger.error(`Error processing session completion for booking ${bookingId}:`, err);
    }
  }
}
