// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { ThrottlerStorageRedisService } from '../throttler/throttler-storage-redis.service';

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        const { createClient } = await import('redis');
        const client = createClient({
          url: configService.get<string>('REDIS_URL'),
        });
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
    RedisService,
    ThrottlerStorageRedisService,
  ],
  exports: [RedisService, ThrottlerStorageRedisService],
})
export class RedisModule {}
