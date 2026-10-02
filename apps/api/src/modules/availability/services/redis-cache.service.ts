import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getEnvConfig } from '../../../config/env.config';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private redis: Redis | null = null;
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();

  onModuleInit(): void {
    const env = getEnvConfig();
    try {
      this.redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });

      this.redis.connect().catch((err) => {
        this.logger.warn(
          `Redis unavailable at ${env.REDIS_URL}. Falling back to in-memory slot caching: ${err.message}`,
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

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        return await this.redis.get(key);
      } catch (err: unknown) {
        this.logger.warn(`Redis GET error for key ${key}: ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(key, value, 'EX', ttlSeconds);
        return;
      } catch (err: unknown) {
        this.logger.warn(`Redis SET error for key ${key}: ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err: unknown) {
        this.logger.warn(`Redis DEL error for key ${key}: ${(err as Error).message}`);
      }
    }
    this.memoryCache.delete(key);
  }

  /**
   * Invalidates all keys matching a wildcard pattern (e.g. "slots:provider123:*")
   */
  async invalidatePattern(pattern: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          this.logger.debug(`Invalidated ${keys.length} keys in Redis matching ${pattern}`);
        }
      } catch (err: unknown) {
        this.logger.warn(`Redis invalidatePattern error for ${pattern}: ${(err as Error).message}`);
      }
    }

    // In-memory wildcard deletion (convert Redis glob pattern to RegExp)
    const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    for (const key of this.memoryCache.keys()) {
      if (regexPattern.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Invalidate all slots for a given provider
   */
  async invalidateProviderSlots(providerId: string): Promise<void> {
    await this.invalidatePattern(`slots:${providerId}:*`);
  }

  /**
   * Clear all cache entries (useful for test isolation)
   */
  clearAll(): void {
    this.memoryCache.clear();
  }
}
