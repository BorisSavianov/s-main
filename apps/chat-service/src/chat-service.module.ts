// apps/chat-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Feature modules
import { ChatModule } from './chat/services/chat.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { AuthModule } from './auth/auth.module';
import { WebSocketModule } from './websocket/websocket.module';

// Entities
import { ChatSession } from './chat/entities/chat-session.entity';
import { ChatMessage } from './chat/entities/chat-message.entity';
import { ChatSessionSummary } from './chat/entities/chat-session-summary.entity';
import { AiContext } from './ai/entities/ai-context.entity';
import { MessageAttachment } from './chat/entities/message-attachment.entity';

// Configuration
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { aiConfig } from './config/ai.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env'],
      load: [databaseConfig, redisConfig, aiConfig],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          ChatSession,
          ChatMessage,
          ChatSessionSummary,
          AiContext,
          MessageAttachment,
        ],
        synchronize: false, // Use migrations in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? {
                rejectUnauthorized: false,
              }
            : false,
        extra: {
          // Connection pool settings
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
      }),
      inject: [ConfigService],
    }),

    // Redis
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: configService.get<string>('REDIS_URL'),
        options: {
          retryDelayOnFailover: 100,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        },
      }),
      inject: [ConfigService],
    }),

    // Queue system
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST') || 'redis',
          port: configService.get<number>('REDIS_PORT') || 6379,
          password: configService.get<string>('REDIS_PASSWORD'),
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
      }),
      inject: [ConfigService],
    }),

    // Microservices communication
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host:
              configService.get<string>('AUTH_SERVICE_HOST') || 'auth-service',
            port: configService.get<number>('AUTH_SERVICE_PORT') || 4000,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'RABBITMQ_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('RABBITMQ_URL')].filter(
              Boolean,
            ) as string[],
            queue: 'chat_queue',
            queueOptions: {
              durable: true,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Feature modules
    AuthModule,
    ChatModule,
    AiModule,
    SearchModule,
    WebSocketModule,
  ],
  providers: [],
})
export class AppModule {}
