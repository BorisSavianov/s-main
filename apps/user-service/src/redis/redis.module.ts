// apps/user-service/src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisService } from './redis.service';
import { RedisHealthIndicator } from '../health/redis.health';

@Module({
  imports: [ConfigModule],
  providers: [RedisService, RedisHealthIndicator],
  exports: [RedisService, RedisHealthIndicator],
})
export class RedisModule {}
