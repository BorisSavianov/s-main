// src/throttler/throttler-storage-redis.service.ts
import { Injectable } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ThrottlerStorageRedisService extends ThrottlerStorageService {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const totalHits = await this.redisService.incr(key);

    if (totalHits === 1) {
      await this.redisService.expire(key, ttl);
    }

    const timeToExpire = await this.redisService.ttl(key);
    let isBlocked = false;
    let timeToBlockExpire = 0;

    if (totalHits > limit) {
      isBlocked = true;
      const blockKey = `${key}-block`;
      const blockHits = await this.redisService.incr(blockKey);
      if (blockHits === 1) {
        await this.redisService.expire(blockKey, blockDuration);
      }
      timeToBlockExpire = await this.redisService.ttl(blockKey);
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }
}
