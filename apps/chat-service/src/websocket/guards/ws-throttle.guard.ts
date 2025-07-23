// apps/chat-service/src/websocket/guards/ws-throttle.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { ConnectionManager } from '../connection.manager';

interface ThrottleConfig {
  name: string;
  ttl: number; // Time window in milliseconds
  limit: number; // Max requests per window
}

interface ThrottleInfo {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

@Injectable()
export class WsThrottleGuard implements CanActivate {
  private readonly logger = new Logger(WsThrottleGuard.name);

  // Rate limiting configurations for different event types
  private readonly throttleConfigs: Map<string, ThrottleConfig> = new Map([
    // Message sending limits
    ['sendMessage', { name: 'message', ttl: 60000, limit: 30 }], // 30 messages per minute
    ['requestAI', { name: 'ai', ttl: 60000, limit: 10 }], // 10 AI requests per minute

    // Typing indicators (more lenient)
    ['typing', { name: 'typing', ttl: 10000, limit: 20 }], // 20 typing events per 10 seconds

    // Session management
    ['joinSession', { name: 'join', ttl: 60000, limit: 10 }], // 10 joins per minute
    ['leaveSession', { name: 'leave', ttl: 60000, limit: 10 }], // 10 leaves per minute

    // Reading messages (very lenient)
    ['markAsRead', { name: 'read', ttl: 10000, limit: 50 }], // 50 read marks per 10 seconds

    // Default for unknown events
    ['default', { name: 'default', ttl: 60000, limit: 100 }], // 100 requests per minute
  ]);

  // Severe violation tracking
  private readonly severeLimits = {
    violations: 5, // Number of violations before temporary block
    blockDuration: 5 * 60 * 1000, // 5 minutes block
    resetWindow: 60 * 60 * 1000, // 1 hour violation reset
  };

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly connectionManager: ConnectionManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const eventName = context.getHandler().name;

      // Get connection info
      const connectionInfo = this.connectionManager.getConnectionInfo(
        client.id,
      );
      if (!connectionInfo) {
        throw new WsException('Connection not found');
      }

      // Create throttle key based on user ID or socket ID
      const identifier = connectionInfo.userId || client.id;
      const config = this.getThrottleConfig(eventName);

      // Check if user is temporarily blocked
      await this.checkTemporaryBlock(identifier);

      // Check rate limit
      const throttleInfo = await this.checkRateLimit(identifier, config);

      if (throttleInfo.blocked) {
        await this.handleViolation(identifier, eventName, config);

        const resetInSeconds = Math.ceil(
          (throttleInfo.resetTime - Date.now()) / 1000,
        );
        throw new WsException({
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please wait ${resetInSeconds} seconds.`,
          retryAfter: resetInSeconds,
          limit: config.limit,
          remaining: 0,
        });
      }

      // Update activity timestamp
      await this.connectionManager.updateActivity(client.id);

      // Add rate limit headers to response (for debugging)
      this.addRateLimitInfo(client, config, throttleInfo);

      return true;
    } catch (error) {
      this.logger.error(`WebSocket throttle check failed: ${error.message}`);

      if (error instanceof WsException) {
        throw error;
      }

      throw new WsException('Rate limiting error');
    }
  }

  private getThrottleConfig(eventName: string): ThrottleConfig {
    return (
      this.throttleConfigs.get(eventName) ||
      this.throttleConfigs.get('default')!
    );
  }

  private async checkRateLimit(
    identifier: string,
    config: ThrottleConfig,
  ): Promise<ThrottleInfo> {
    const key = `throttle:${config.name}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.ttl;

    try {
      // Use Redis sorted set to track requests in time window
      const pipe = this.redis.pipeline();

      // Remove old entries
      pipe.zremrangebyscore(key, 0, windowStart);

      // Count current requests
      pipe.zcard(key);

      // Add current request
      pipe.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiration
      pipe.expire(key, Math.ceil(config.ttl / 1000));

      const results = await pipe.exec();
      const currentCount = (results?.[1]?.[1] as number) || 0;

      const resetTime = now + config.ttl;
      const blocked = currentCount >= config.limit;

      // If blocked, remove the request we just added
      if (blocked) {
        await this.redis.zrem(key, `${now}-${Math.random()}`);
      }

      return {
        count: currentCount,
        resetTime,
        blocked,
      };
    } catch (error) {
      this.logger.error(`Rate limit check failed: ${error.message}`);
      // In case of Redis error, allow the request but log it
      return {
        count: 0,
        resetTime: now + config.ttl,
        blocked: false,
      };
    }
  }

  private async checkTemporaryBlock(identifier: string): Promise<void> {
    const blockKey = `block:${identifier}`;
    const blockUntil = await this.redis.get(blockKey);

    if (blockUntil && Date.now() < parseInt(blockUntil)) {
      const remainingSeconds = Math.ceil(
        (parseInt(blockUntil) - Date.now()) / 1000,
      );
      throw new WsException({
        code: 'TEMPORARILY_BLOCKED',
        message: `Temporarily blocked due to rate limit violations. Try again in ${remainingSeconds} seconds.`,
        blockedUntil: parseInt(blockUntil),
        retryAfter: remainingSeconds,
      });
    }
  }

  private async handleViolation(
    identifier: string,
    eventName: string,
    config: ThrottleConfig,
  ): Promise<void> {
    try {
      const violationKey = `violations:${identifier}`;
      const violationCount = await this.redis.incr(violationKey);

      // Set expiration for violation counter
      if (violationCount === 1) {
        await this.redis.expire(
          violationKey,
          Math.ceil(this.severeLimits.resetWindow / 1000),
        );
      }

      this.logger.warn(
        `Rate limit violation for ${identifier}: ${eventName} (${violationCount}/${this.severeLimits.violations})`,
      );

      // Check if we should temporarily block the user
      if (violationCount >= this.severeLimits.violations) {
        const blockUntil = Date.now() + this.severeLimits.blockDuration;
        const blockKey = `block:${identifier}`;

        await this.redis.setex(
          blockKey,
          Math.ceil(this.severeLimits.blockDuration / 1000),
          blockUntil.toString(),
        );

        // Reset violation counter
        await this.redis.del(violationKey);

        this.logger.warn(
          `Temporarily blocked ${identifier} for ${this.severeLimits.blockDuration / 1000} seconds due to repeated violations`,
        );
      }

      // Store violation details for monitoring
      await this.storeViolationDetails(identifier, eventName, config);
    } catch (error) {
      this.logger.error(`Failed to handle violation: ${error.message}`);
    }
  }

  private async storeViolationDetails(
    identifier: string,
    eventName: string,
    config: ThrottleConfig,
  ): Promise<void> {
    try {
      const violationData = {
        identifier,
        eventName,
        config: config.name,
        limit: config.limit,
        window: config.ttl,
        timestamp: new Date().toISOString(),
      };

      // Store in Redis list for monitoring (keep last 100 violations)
      const violationsKey = 'system:violations';
      await this.redis.lpush(violationsKey, JSON.stringify(violationData));
      await this.redis.ltrim(violationsKey, 0, 99);
      await this.redis.expire(violationsKey, 86400); // 24 hours
    } catch (error) {
      this.logger.error(`Failed to store violation details: ${error.message}`);
    }
  }

  private addRateLimitInfo(
    client: Socket,
    config: ThrottleConfig,
    throttleInfo: ThrottleInfo,
  ): void {
    // Add rate limit information to socket metadata for debugging
    if (!client.data) {
      client.data = {};
    }

    client.data.rateLimit = {
      limit: config.limit,
      remaining: Math.max(0, config.limit - throttleInfo.count),
      resetTime: throttleInfo.resetTime,
      window: config.ttl,
    };
  }

  // Public method to get current rate limit status
  async getRateLimitStatus(
    identifier: string,
    eventName: string,
  ): Promise<any> {
    try {
      const config = this.getThrottleConfig(eventName);
      const key = `throttle:${config.name}:${identifier}`;
      const now = Date.now();
      const windowStart = now - config.ttl;

      const currentCount = await this.redis.zcount(key, windowStart, now);
      const blockKey = `block:${identifier}`;
      const blockUntil = await this.redis.get(blockKey);

      return {
        eventName,
        limit: config.limit,
        remaining: Math.max(0, config.limit - currentCount),
        resetTime: now + config.ttl,
        window: config.ttl,
        blocked: blockUntil ? Date.now() < parseInt(blockUntil) : false,
        blockUntil: blockUntil ? parseInt(blockUntil) : null,
      };
    } catch (error) {
      this.logger.error(`Failed to get rate limit status: ${error.message}`);
      return null;
    }
  }

  // Method to clear violations (admin use)
  async clearViolations(identifier: string): Promise<void> {
    try {
      const keys = [`violations:${identifier}`, `block:${identifier}`];

      // Also clear all throttle keys for this identifier
      const throttleKeys = await this.redis.keys(`throttle:*:${identifier}`);
      keys.push(...throttleKeys);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Cleared violations and blocks for ${identifier}`);
      }
    } catch (error) {
      this.logger.error(`Failed to clear violations: ${error.message}`);
    }
  }

  // Get system-wide throttling statistics
  async getThrottleStats(): Promise<any> {
    try {
      const violationsData = await this.redis.lrange(
        'system:violations',
        0,
        -1,
      );
      const violations = violationsData.map((data) => JSON.parse(data));

      const stats = {
        totalViolations: violations.length,
        violationsByEvent: {},
        violationsByIdentifier: {},
        recentViolations: violations.slice(0, 10),
      };

      violations.forEach((violation) => {
        stats.violationsByEvent[violation.eventName] =
          (stats.violationsByEvent[violation.eventName] || 0) + 1;
        stats.violationsByIdentifier[violation.identifier] =
          (stats.violationsByIdentifier[violation.identifier] || 0) + 1;
      });

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get throttle stats: ${error.message}`);
      return null;
    }
  }
}
