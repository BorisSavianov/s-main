// apps/chat-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  ClientsModule,
  Transport,
  TcpClientOptions,
  RmqOptions,
} from '@nestjs/microservices';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { LogLevel } from 'typeorm';

// Configuration
import envConfig, { validate } from './config/env.config';
import { AppConfigService } from './config/config.service';
import { AppConfigModule } from './config/config.module';

// Feature modules
import { ChatModule } from './chat/services/chat.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { WebSocketModule } from './websocket/websocket.module';

// Auth-service guards & strategies
import { JwtAuthGuard } from '../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth-service/src/auth/guards/roles.guard';
import { JwtStrategy } from '../../auth-service/src/auth/strategies/jwt.strategy';
import { RefreshTokenStrategy } from '../../auth-service/src/auth/strategies/refresh-token.strategy';

// Monitoring and Logging
import {
  PrometheusController,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { RedisModule as JwtRefreshRedisModule } from 'apps/auth-service/src/redis/redis.module';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';
import { HealthModule } from './health/health.module';
import { MessageAttachment } from './chat/entities/message-attachment.entity';
import { ChatMessage } from './chat/entities/chat-message.entity';
import { AiContext } from './ai/entities/ai-context.entity';
import { ChatSession } from './chat/entities/chat-session.entity';
import { ChatSessionSummary } from './chat/entities/chat-session-summary.entity';

// User-service entities
import { User } from 'apps/user-service/src/database/entities/user.entity';
import { CounselorProfile } from 'apps/user-service/src/database/entities/counselor-profile.entity';
import { UserSession } from 'apps/user-service/src/database/entities/user-session.entity';
import { OAuthProvider } from 'apps/user-service/src/database/entities/oauth-provider.entity';

// Notification-service entities
import { Notification } from 'apps/notification-service/src/notifications/entities/notification.entity';
import { NotificationBatchJob } from 'apps/notification-service/src/notifications/entities/notification-batch-job.entity';
import { NotificationPreference } from 'apps/notification-service/src/prefrences/entities/notification-prefrence.entity';
import { NotificationTemplate } from 'apps/notification-service/src/templates/entities/notification-template.entity';
import { PushSubscription } from 'apps/notification-service/src/notifications/entities/push-subscription.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebSearchModule } from './web-search/web-search.module';
import { UserPreferences } from 'apps/user-service/src/database/entities/user-preferences.entity';

@Module({
  imports: [
    // Event emitter for internal events
    EventEmitterModule.forRoot(),
    // TypeORM (Postgres)
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: async (
        cfg: AppConfigService,
      ): Promise<TypeOrmModuleOptions> => {
        const c = cfg.databaseConfig;
        return {
          ...c,
          logging: c.logging === 'all' ? 'all' : (c.logging as LogLevel[]),
          synchronize: false,
          autoLoadEntities: true,
          entities: [
            ChatSession,
            ChatMessage,
            MessageAttachment,
            ChatSessionSummary,
            AiContext,
            User,
            CounselorProfile,
            UserSession,
            OAuthProvider,
            Notification,
            NotificationBatchJob,
            NotificationPreference,
            NotificationTemplate,
            PushSubscription,
            UserPreferences,
          ],
          extra: {
            ...c.extra,
            max: c.extra?.max ?? 20,
            min: 0,
            acquire: 30000,
            idle: 10000,
            idleTimeoutMillis: c.extra?.idleTimeoutMillis ?? 30000,
            connectionTimeoutMillis: c.extra?.connectionTimeoutMillis ?? 30000,
          },
        };
      },
      inject: [AppConfigService],
    }),
    // application‐wide config
    AppConfigModule,
    AuthCoreModule,
    JwtRefreshRedisModule,
    WebSearchModule,
    // environment variables + validation
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [envConfig],
      validate,
      cache: true,
      expandVariables: true,
    }),

    // Prometheus metrics
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: { prefix: 'chat_service_' },
      },
    }),

    // Redis
    RedisModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (cfg: AppConfigService) => {
        const r = cfg.redisConfig;
        if ('url' in r) {
          return { type: 'single' as const, url: r.url };
        }
        return {
          type: 'single' as const,
          options: {
            ...r.options,
            keepAlive:
              typeof r.options.keepAlive === 'boolean'
                ? r.options.keepAlive
                  ? 1
                  : 0
                : r.options.keepAlive,
          },
        };
      },
      inject: [AppConfigService],
    }),

    // Bull (queues)
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (cfg: AppConfigService) => cfg.bullRedisConfig,
      inject: [AppConfigService],
    }),

    // Microservices (TCP & RMQ)
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        imports: [AppConfigModule],
        useFactory: (cfg: AppConfigService): TcpClientOptions => ({
          transport: Transport.TCP,
          options: {
            host: cfg.authServiceConfig.host,
            port: cfg.authServiceConfig.port,
          },
        }),
        inject: [AppConfigService],
      },
    ]),

    // Scheduling
    ScheduleModule.forRoot(),

    // JWT + Passport setup for REST/WebSocket
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
          issuer: configService.get<string>('JWT_ISSUER', 'mental-health-auth'),
          audience: configService.get<string>(
            'JWT_AUDIENCE',
            'mental-health-platform',
          ),
        },
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Throttling
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (cfg: AppConfigService) => cfg.throttleConfig,
      inject: [AppConfigService],
    }),

    // Domain feature modules
    ChatModule,
    AiModule,
    SearchModule,
    WebSocketModule,
    HealthModule,
  ],
  controllers: [PrometheusController],
  providers: [
    AppConfigService,

    // Auth strategies
    JwtStrategy,
    RefreshTokenStrategy,

    // Global guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
