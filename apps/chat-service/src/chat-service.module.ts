// apps/chat-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import {
  ClientsModule,
  Transport,
  TcpClientOptions,
  RmqOptions,
} from '@nestjs/microservices';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

// Feature modules
import { ChatModule } from './chat/services/chat.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { AuthModule } from '../../auth-service/src/auth/auth.module';
import { WebSocketModule } from './websocket/websocket.module';

// Configuration imports
import databaseConfig from './config/database.config';
import redisConfig, {
  bullRedisConfig,
  sessionRedisConfig,
  cacheRedisConfig,
} from './config/redis.config';
import aiConfig from './config/ai.config';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        '.env.local',
        '.env',
      ],
      load: [
        databaseConfig,
        redisConfig,
        bullRedisConfig,
        sessionRedisConfig,
        cacheRedisConfig,
        aiConfig,
      ],
      cache: true,
      expandVariables: true,
    }),

    // Database configuration
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const config = configService.get('database');

        // Additional runtime configuration
        return {
          ...config,
          // Override or add specific settings
          keepConnectionAlive: true,
          // Add connection error handling
          extra: {
            ...config.extra,
            // Ensure proper connection handling
            max: config.extra?.max || 20,
            min: 0,
            acquire: 30000,
            idle: 10000,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Main Redis connection
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis');

        return {
          type: 'single',
          ...(redisConfig.url
            ? { url: redisConfig.url }
            : {
                options: {
                  host: redisConfig.host,
                  port: redisConfig.port,
                  password: redisConfig.password,
                  db: redisConfig.db,
                  keyPrefix: redisConfig.keyPrefix,
                  retryDelayOnFailover: redisConfig.retryDelayOnFailover,
                  enableReadyCheck: redisConfig.enableReadyCheck,
                  maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
                  lazyConnect: redisConfig.lazyConnect,
                  connectTimeout: redisConfig.connectTimeout,
                  commandTimeout: redisConfig.commandTimeout,
                  family: redisConfig.family,
                  keepAlive: redisConfig.keepAlive,
                  ...(redisConfig.tls && { tls: redisConfig.tls }),
                },
              }),
        };
      },
      inject: [ConfigService],
    }),

    // Bull Queue system
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const bullConfig = configService.get('bullRedis');

        return {
          redis: {
            host: bullConfig.host,
            port: bullConfig.port,
            password: bullConfig.password,
            db: bullConfig.db,
            maxRetriesPerRequest: bullConfig.maxRetriesPerRequest,
            retryDelayOnFailover: bullConfig.retryDelayOnFailover,
            enableReadyCheck: bullConfig.enableReadyCheck,
            lazyConnect: bullConfig.lazyConnect,
          },
          defaultJobOptions: {
            removeOnComplete: 10,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
          settings: {
            stalledInterval: 30 * 1000,
            maxStalledCount: 1,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Microservices communication
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService): TcpClientOptions => ({
          transport: Transport.TCP,
          options: {
            host:
              configService.get<string>('AUTH_SERVICE_HOST') || 'auth-service',
            port: configService.get<number>('AUTH_SERVICE_PORT') || 4000,
            // Add retry configuration
            // retryAttempts: 5,
            // retryDelay: 3000,
          },
        }),
        inject: [ConfigService],
      },
      // Conditionally add RabbitMQ service only if configured
      ...(process.env.RABBITMQ_URL
        ? [
            {
              name: 'RABBITMQ_SERVICE',
              imports: [ConfigModule],
              useFactory: (configService: ConfigService): RmqOptions => {
                const rabbitmqUrl = configService.get<string>('RABBITMQ_URL');

                return {
                  transport: Transport.RMQ,
                  options: {
                    urls: [rabbitmqUrl!], // We know it exists due to the condition above
                    queue: 'chat_queue',
                    queueOptions: {
                      durable: true,
                      arguments: {
                        'x-message-ttl': 60000, // 1 minute TTL
                      },
                    },
                    socketOptions: {
                      keepAlive: true,
                      heartbeatIntervalInSeconds: 30,
                      reconnectTimeInSeconds: 1,
                    },
                  },
                };
              },
              inject: [ConfigService],
            },
          ]
        : []),
    ]),

    // Rate limiting with multiple strategies
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000, // 1 second
            limit: configService.get<number>('THROTTLE_SHORT_LIMIT') || 10,
          },
          {
            name: 'medium',
            ttl: 10000, // 10 seconds
            limit: configService.get<number>('THROTTLE_MEDIUM_LIMIT') || 50,
          },
          {
            name: 'long',
            ttl: 60000, // 1 minute
            limit: configService.get<number>('THROTTLE_LONG_LIMIT') || 200,
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Feature modules
    AuthModule,
    ChatModule,
    AiModule,
    SearchModule,
    WebSocketModule,
  ],
  providers: [
    // Global throttler guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    // Log important configuration on startup (non-sensitive info only)
    console.log('Chat Service Configuration:');
    console.log(`- Environment: ${this.configService.get('NODE_ENV')}`);
    console.log(`- AI Provider: ${this.configService.get('ai.provider')}`);
    console.log(`- Database: ${this.configService.get('database.type')}`);
    console.log(`- Redis Host: ${this.configService.get('redis.host')}`);
  }
}
