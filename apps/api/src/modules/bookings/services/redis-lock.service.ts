import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { getEnvConfig } from '../../../config/env.config';

interface MemoryLockEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class RedisLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private redis: Redis | null = null;
  private readonly memoryLocks = new Map<string, MemoryLockEntry>();

  onModuleInit(): void {
    const env = getEnvConfig();
    try {
      this.redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });

      this.redis.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}. Using in-memory lock store.`);
      });

      this.redis.connect().catch((err) => {
        this.logger.warn(
          `Redis unavailable at ${env.REDIS_URL} for distributed locking. Using in-memory fallback: ${err.message}`,
        );
      });
    } catch {
      this.logger.warn(
        'Failed to initialize Redis client for locking, using in-memory lock store.',
      );
      this.redis = null;
    }
  }

  onModuleDestroy(): void {
    if (this.redis) {
      try {
        this.redis.disconnect();
      } catch {
        // Ignore disconnect error
      }
    }
  }

  /**
   * Acquire a distributed lock on a resource for the specified TTL in milliseconds.
   * Returns a unique lock token if acquired, or null if lock is already held.
   */
  async acquireLock(resourceKey: string, ttlMs: number = 600000): Promise<string | null> {
    const lockKey = `lock:${resourceKey}`;
    const token = uuidv4();

    if (this.redis && this.redis.status === 'ready') {
      try {
        // Atomic SET with NX (not exists) and PX (millisecond TTL)
        const result = await this.redis.set(lockKey, token, 'PX', ttlMs, 'NX');
        if (result === 'OK') {
          return token;
        }
        return null;
      } catch (err: unknown) {
        this.logger.warn(
          `Redis acquireLock failed for ${lockKey}, falling back to in-memory: ${(err as Error).message}`,
        );
      }
    }

    // In-memory fallback
    const now = Date.now();
    const existing = this.memoryLocks.get(lockKey);
    if (existing && existing.expiresAt > now) {
      return null; // Lock is currently held and active
    }

    this.memoryLocks.set(lockKey, {
      token,
      expiresAt: now + ttlMs,
    });
    return token;
  }

  /**
   * Release lock safely by verifying the token using an atomic Lua script in Redis
   */
  async releaseLock(resourceKey: string, token: string): Promise<boolean> {
    const lockKey = `lock:${resourceKey}`;

    if (this.redis && this.redis.status === 'ready') {
      try {
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const result = await this.redis.eval(luaScript, 1, lockKey, token);
        return result === 1;
      } catch (err: unknown) {
        this.logger.warn(`Redis releaseLock failed for ${lockKey}: ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    const existing = this.memoryLocks.get(lockKey);
    if (existing && existing.token === token) {
      this.memoryLocks.delete(lockKey);
      return true;
    }
    return false;
  }

  /**
   * Convenience helper: Acquire slot lock for provider and slot start time
   */
  async acquireSlotLock(
    providerId: string,
    startAtIso: string,
    ttlSeconds = 600,
  ): Promise<string | null> {
    const normalizedTime = new Date(startAtIso).toISOString();
    return this.acquireLock(`slot:${providerId}:${normalizedTime}`, ttlSeconds * 1000);
  }

  /**
   * Convenience helper: Release slot lock for provider and slot start time
   */
  async releaseSlotLock(providerId: string, startAtIso: string, token: string): Promise<boolean> {
    const normalizedTime = new Date(startAtIso).toISOString();
    return this.releaseLock(`slot:${providerId}:${normalizedTime}`, token);
  }

  /**
   * Execute an operation inside a distributed critical section
   */
  async withLock<T>(resourceKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = await this.acquireLock(resourceKey, ttlMs);
    if (!token) {
      throw new Error(`Failed to acquire lock for resource: ${resourceKey}`);
    }
    try {
      return await fn();
    } finally {
      await this.releaseLock(resourceKey, token);
    }
  }
}
