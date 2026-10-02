import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getEnvConfig } from '../../../config/env.config';

interface MemoryRateRecord {
  count: number;
  resetAt: number;
}

interface LockRecord {
  attempts: number;
  lockedUntil?: number;
}

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis | null = null;
  private readonly memoryStore = new Map<string, MemoryRateRecord>();
  private readonly memoryLocks = new Map<string, LockRecord>();

  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes
  private readonly ATTEMPT_WINDOW_SECONDS = 15 * 60; // 15 minutes window

  onModuleInit(): void {
    const env = getEnvConfig();
    try {
      this.redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't crash or hang if Redis is down
        lazyConnect: true,
      });

      this.redis.connect().catch((err) => {
        this.logger.warn(
          `Redis unavailable at ${env.REDIS_URL}. Falling back to in-memory rate limiting: ${err.message}`,
        );
        this.redis = null;
      });
    } catch {
      this.logger.warn('Failed to initialize Redis client, using in-memory store.');
      this.redis = null;
    }
  }

  onModuleDestroy(): void {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const prefixedKey = `ratelimit:${key}`;

    if (this.redis) {
      try {
        const current = await this.redis.incr(prefixedKey);
        if (current === 1) {
          await this.redis.expire(prefixedKey, windowSeconds);
        }
        return {
          allowed: current <= maxRequests,
          remaining: Math.max(0, maxRequests - current),
        };
      } catch {
        // Fallback to memory if redis operation errors
      }
    }

    const now = Date.now();
    const record = this.memoryStore.get(prefixedKey);

    if (!record || now > record.resetAt) {
      this.memoryStore.set(prefixedKey, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    record.count += 1;
    return {
      allowed: record.count <= maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
    };
  }

  async isAccountLocked(
    identifier: string,
  ): Promise<{ locked: boolean; remainingSeconds: number }> {
    const key = `lockout:${identifier.toLowerCase()}`;
    const now = Date.now();

    if (this.redis) {
      try {
        const ttl = await this.redis.ttl(key);
        if (ttl > 0) {
          return { locked: true, remainingSeconds: ttl };
        }
        return { locked: false, remainingSeconds: 0 };
      } catch {
        // Fallback to memory
      }
    }

    const lock = this.memoryLocks.get(key);
    if (lock && lock.lockedUntil && lock.lockedUntil > now) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((lock.lockedUntil - now) / 1000),
      };
    }

    return { locked: false, remainingSeconds: 0 };
  }

  async recordFailedLogin(
    identifier: string,
  ): Promise<{ isLocked: boolean; attemptsLeft: number; remainingSeconds: number }> {
    const key = `lockout:${identifier.toLowerCase()}`;
    const attemptsKey = `attempts:${identifier.toLowerCase()}`;
    const now = Date.now();

    if (this.redis) {
      try {
        const attempts = await this.redis.incr(attemptsKey);
        if (attempts === 1) {
          await this.redis.expire(attemptsKey, this.ATTEMPT_WINDOW_SECONDS);
        }

        if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
          await this.redis.set(key, 'locked', 'EX', this.LOCKOUT_DURATION_SECONDS);
          await this.redis.del(attemptsKey);
          return {
            isLocked: true,
            attemptsLeft: 0,
            remainingSeconds: this.LOCKOUT_DURATION_SECONDS,
          };
        }

        return {
          isLocked: false,
          attemptsLeft: Math.max(0, this.MAX_LOGIN_ATTEMPTS - attempts),
          remainingSeconds: 0,
        };
      } catch {
        // Fallback to memory
      }
    }

    let record = this.memoryLocks.get(key);
    if (!record) {
      record = { attempts: 0 };
      this.memoryLocks.set(key, record);
    }

    record.attempts += 1;

    if (record.attempts >= this.MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_SECONDS * 1000;
      record.attempts = 0; // reset counter after locking
      return {
        isLocked: true,
        attemptsLeft: 0,
        remainingSeconds: this.LOCKOUT_DURATION_SECONDS,
      };
    }

    return {
      isLocked: false,
      attemptsLeft: Math.max(0, this.MAX_LOGIN_ATTEMPTS - record.attempts),
      remainingSeconds: 0,
    };
  }

  async resetFailedAttempts(identifier: string): Promise<void> {
    const key = `lockout:${identifier.toLowerCase()}`;
    const attemptsKey = `attempts:${identifier.toLowerCase()}`;

    if (this.redis) {
      try {
        await this.redis.del(key, attemptsKey);
        return;
      } catch {
        // Fallback to memory
      }
    }

    this.memoryLocks.delete(key);
  }
}
