// apps/mood-service/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  readiness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'mood-service',
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}
