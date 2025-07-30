// apps/user-service/src/redis/redis.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    this.client = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.error(`Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      this.logger.error(`Error setting expiration for key ${key}:`, error);
    }
  }

  async ping(): Promise<string> {
    return await this.client.ping();
  }

  async invalidateUserCache(userId: string): Promise<void> {
    try {
      await this.del(`user:${userId}`);
      await this.del(`counselor:${userId}`);
    } catch (error) {
      this.logger.error(`Error invalidating user cache for ${userId}:`, error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Error invalidating pattern ${pattern}:`, error);
    }
  }

  // Session management methods
  async setSession(
    sessionId: string,
    sessionData: any,
    ttl: number,
  ): Promise<void> {
    try {
      await this.set(`session:${sessionId}`, JSON.stringify(sessionData), ttl);
    } catch (error) {
      this.logger.error(`Error setting session ${sessionId}:`, error);
    }
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    try {
      const data = await this.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.del(`session:${sessionId}`);
    } catch (error) {
      this.logger.error(`Error deleting session ${sessionId}:`, error);
    }
  }
}
