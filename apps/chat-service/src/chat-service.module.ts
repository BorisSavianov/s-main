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

// Configuration
import envConfig, { validate } from './config/env.config';
import { AppConfigService } from './config/config.service';

// Feature modules
import { ChatModule } from './chat/services/chat.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { WebSocketModule } from './websocket/websocket.module';

import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { LoggerOptions, LogLevel } from 'typeorm';
import { AppConfigModule } from './config/config.module';
import {
  PrometheusController,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    AppConfigModule,
    PrometheusModule.register(),
    // Database configuration
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: async (
        appConfigService: AppConfigService,
      ): Promise<TypeOrmModuleOptions> => {
        const config = appConfigService.databaseConfig;

        return {
          ...config,
          logging:
            config.logging === 'all' ? 'all' : (config.logging as LogLevel[]),
          synchronize: false, // disable automatic sync, handle migrations manually
          extra: {
            ...config.extra,
            max: config.extra?.max || 20,
            min: 0,
            acquire: 30000,
            idle: 10000,
            idleTimeoutMillis: config.extra?.idleTimeoutMillis || 30000,
            connectionTimeoutMillis:
              config.extra?.connectionTimeoutMillis || 30000,
          },
        };
      },
      inject: [AppConfigService],
    }),

    // Main Redis connection
    RedisModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (appConfigService: AppConfigService) => {
        const redisConfig = appConfigService.redisConfig;

        // Handle different Redis configuration formats
        if ('url' in redisConfig) {
          return {
            type: 'single' as const,
            url: redisConfig.url,
          };
        }

        // For options-based configuration, ensure keepAlive is a number
        return {
          type: 'single' as const,
          options: {
            ...redisConfig.options,
            // Convert boolean keepAlive to number (1 for true, 0 for false)
            keepAlive:
              typeof redisConfig.options.keepAlive === 'boolean'
                ? redisConfig.options.keepAlive
                  ? 1
                  : 0
                : redisConfig.options.keepAlive,
          },
        };
      },
      inject: [AppConfigService],
    }),

    // Bull Queue system
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (appConfigService: AppConfigService) => {
        const bullConfig = appConfigService.bullRedisConfig;
        return bullConfig;
      },
      inject: [AppConfigService],
    }),

    // Microservices communication
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        imports: [AppConfigModule],
        useFactory: (appConfigService: AppConfigService): TcpClientOptions => {
          const authConfig = appConfigService.authServiceConfig;
          return {
            transport: Transport.TCP,
            options: {
              host: authConfig.host,
              port: authConfig.port,
            },
          };
        },
        inject: [AppConfigService],
      },
      // Conditionally add RabbitMQ service only if configured
      ...(process.env.RABBITMQ_URL
        ? [
            {
              name: 'RABBITMQ_SERVICE',
              imports: [AppConfigModule],
              useFactory: (appConfigService: AppConfigService): RmqOptions => {
                const rabbitmqConfig = appConfigService.rabbitmqConfig;

                if (!rabbitmqConfig) {
                  throw new Error('RabbitMQ configuration is missing');
                }

                return {
                  transport: Transport.RMQ,
                  options: rabbitmqConfig,
                };
              },
              inject: [AppConfigService],
            },
          ]
        : []),
    ]),

    // Rate limiting with multiple strategies
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (appConfigService: AppConfigService) => {
        return appConfigService.throttleConfig;
      },
      inject: [AppConfigService],
    }),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    ChatModule,
    AiModule,
    SearchModule,
    WebSocketModule,
  ],
  controllers: [PrometheusController],
  providers: [
    // Register AppConfigService as a provider
    AppConfigService,
    // Global throttler guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  constructor(private appConfigService: AppConfigService) {}
}
