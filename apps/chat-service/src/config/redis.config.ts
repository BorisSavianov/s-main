// apps/chat-service/src/config/redis.config.ts
import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
  family?: 4 | 6;
  keepAlive?: boolean;
  // Cluster configuration
  enableOfflineQueue?: boolean;
  // Sentinel configuration
  sentinels?: Array<{ host: string; port: number }>;
  name?: string;
  // TLS configuration
  tls?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export interface BullRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

export default registerAs('redis', () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  const config: RedisConfig = {
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 5000,
    family: 4,
    keepAlive: true,
    enableOfflineQueue: false,
  };

  // Connection configuration
  if (process.env.REDIS_URL) {
    // Use connection URL (recommended for production)
    config.url = process.env.REDIS_URL;
  } else {
    // Use individual connection parameters
    config.host = process.env.REDIS_HOST || 'localhost';
    config.port = parseInt(process.env.REDIS_PORT || '6379', 10);
    config.password = process.env.REDIS_PASSWORD;
    config.db = parseInt(process.env.REDIS_DB || '0', 10);
  }

  // Key prefix for better organization
  config.keyPrefix = process.env.REDIS_KEY_PREFIX || 'chat_service:';

  // TLS configuration for production
  if (isProduction && process.env.REDIS_TLS_ENABLED === 'true') {
    config.tls = {
      rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
      ca: process.env.REDIS_TLS_CA,
      cert: process.env.REDIS_TLS_CERT,
      key: process.env.REDIS_TLS_KEY,
    };
  }

  // Sentinel configuration (for high availability)
  if (process.env.REDIS_SENTINEL_ENABLED === 'true') {
    const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS?.split(',') || [];
    config.sentinels = sentinelHosts.map((hostPort) => {
      const [host, port] = hostPort.split(':');
      return {
        host: host.trim(),
        port: parseInt(port?.trim() || '26379', 10),
      };
    });
    config.name = process.env.REDIS_SENTINEL_MASTER_NAME || 'mymaster';
  }

  return config;
});

// Bull queue specific Redis configuration
export const bullRedisConfig = registerAs('bullRedis', (): BullRedisConfig => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_BULL_DB || '1', 10), // Use different DB for Bull
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    lazyConnect: true,
  };
});

// Session store Redis configuration
export const sessionRedisConfig = registerAs(
  'sessionRedis',
  (): RedisConfig => {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_SESSION_DB || '2', 10), // Use different DB for sessions
      keyPrefix: 'sess:',
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };
  },
);

// Cache Redis configuration
export const cacheRedisConfig = registerAs('cacheRedis', (): RedisConfig => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_CACHE_DB || '3', 10), // Use different DB for caching
    keyPrefix: 'cache:',
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    // Cache-specific settings
    commandTimeout: 3000, // Shorter timeout for cache operations
  };
});

// Type-safe configuration validation
export const validateRedisConfig = (config: any): RedisConfig => {
  if (!config.url && !config.host) {
    throw new Error(
      'Redis configuration requires either REDIS_URL or REDIS_HOST',
    );
  }

  if (config.port && (config.port < 1 || config.port > 65535)) {
    throw new Error('Redis port must be between 1 and 65535');
  }

  if (config.db && (config.db < 0 || config.db > 15)) {
    throw new Error('Redis database number must be between 0 and 15');
  }

  return config;
};

// Redis health check utility
export const createRedisHealthCheck = () => {
  return {
    name: 'redis',
    timeout: 3000,
    check: async (redisClient: any) => {
      try {
        await redisClient.ping();
        return { status: 'up' };
      } catch (error) {
        return {
          status: 'down',
          message: error.message,
        };
      }
    },
  };
};
