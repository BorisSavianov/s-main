// apps/user-service/src/health/redis.health.ts
import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicatorService {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redisService.ping();
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, { message: error.message });
    }
  }

  private getStatus(
    key: string,
    isHealthy: boolean,
    data?: Record<string, any>,
  ): HealthIndicatorResult {
    return {
      [key]: {
        status: isHealthy ? 'up' : 'down',
        ...data,
      },
    };
  }
}
