// src/redis/redis.service.ts
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.setEx(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return await this.redis.del(key);
  }

  async exists(key: string): Promise<number> {
    return await this.redis.exists(key);
  }

  async incr(key: string): Promise<number> {
    return await this.redis.incr(key);
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    return await this.redis.expire(key, ttl);
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return await this.redis.hGet(key, field);
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    return await this.redis.hSet(key, field, value);
  }

  async hDel(key: string, field: string): Promise<number> {
    return await this.redis.hDel(key, field);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return await this.redis.hGetAll(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return await this.redis.publish(channel, message);
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    const subscriber = this.redis.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, callback);
  }

  async flushCache(pattern?: string): Promise<void> {
    if (pattern) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } else {
      await this.redis.flushDb();
    }
  }

  // Set operations for queue management
  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.redis.sAdd(key, members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.redis.sRem(key, members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redis.sMembers(key);
  }

  async scard(key: string): Promise<number> {
    return await this.redis.sCard(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return await this.redis.sIsMember(key, member);
  }

  async setJson(key: string, value: any, ttl?: number): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await this.set(key, jsonValue, ttl);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Error parsing JSON from Redis:', error);
      return null;
    }
  }

  // Session management utilities
  async setSession(
    sessionId: string,
    sessionData: any,
    ttl: number = 86400,
  ): Promise<void> {
    const key = `session:${sessionId}`;
    await this.setJson(key, sessionData, ttl);
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    const key = `session:${sessionId}`;
    return await this.getJson<T>(key);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  // Rate limiting utilities
  async checkRateLimit(
    key: string,
    limit: number,
    window: number,
  ): Promise<{
    allowed: boolean;
    remainingAttempts: number;
    resetTime: number;
  }> {
    const current = await this.incr(key);

    if (current === 1) {
      await this.expire(key, window);
    }

    const ttl = await this.ttl(key);
    const resetTime = Date.now() + ttl * 1000;

    return {
      allowed: current <= limit,
      remainingAttempts: Math.max(0, limit - current),
      resetTime,
    };
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }

  // User-specific cache invalidation
  async invalidateUserCache(userId: string): Promise<void> {
    await this.invalidatePattern(`user:${userId}:*`);
  }
}
