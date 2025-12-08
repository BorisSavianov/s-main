// apps/video-service/src/video-service.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { VideoModule } from './video/services/video.module';
import {
  PrometheusController,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { VideoParticipant } from './video/entities/video-participant.entity';
import { VideoRoom } from './video/entities/video-room.entity';
import { VideoSession } from './video/entities/video-session.entity';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';
import { CounselorProfile } from 'apps/auth-service/src/database/entities/counselor-profile.entity';
import { OAuthProvider } from 'apps/auth-service/src/database/entities/oauth-provider.entity';
import { UserSession } from 'apps/auth-service/src/database/entities/user-session.entity';
import { User } from 'apps/auth-service/src/database/entities/user.entity';
import { Notification } from 'apps/notification-service/src/notifications/entities/notification.entity';
import { PushSubscription } from 'apps/notification-service/src/notifications/entities/push-subscription.entity';
import { NotificationTemplate } from 'apps/notification-service/src/templates/entities/notification-template.entity';
import { NotificationPreference } from 'apps/notification-service/src/prefrences/entities/notification-prefrence.entity';
import { UserPreferences } from 'apps/auth-service/src/database/entities/user-preferences.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Prometheus metrics
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: { prefix: 'user_service_' },
      },
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          UserPreferences,
          VideoParticipant,
          VideoRoom,
          VideoSession,
          User,
          UserSession,
          OAuthProvider,
          CounselorProfile,
          Notification,
          PushSubscription,
          NotificationTemplate,
          NotificationPreference,
        ],
        synchronize: false, // Use migrations in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
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
          limit: 100,
        },
      ],
      inject: [ConfigService],
    }),

    HealthModule,
    VideoModule,
    AuthCoreModule,
  ],
  controllers: [PrometheusController],
})
export class AppModule {}
