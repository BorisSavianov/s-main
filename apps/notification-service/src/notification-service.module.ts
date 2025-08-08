// apps/notification-service/src/notification-service.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  PrometheusController,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

// Feature Modules
import { NotificationModule } from './notifications/services/notification.module';
import { TemplateModule } from './templates/services/template.module';
import { PreferencesModule } from './prefrences/services/prefrences.module';
import { HealthModule } from './health/health.module';

// Configuration
import { NotificationServiceController } from './notification-service.controller';
import { DatabaseModule } from './database/database.module';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';

// Entities
import { Notification } from './notifications/entities/notification.entity';
import { NotificationPreference } from './prefrences/entities/notification-prefrence.entity';
import { NotificationTemplate } from './templates/entities/notification-template.entity';
import { PushSubscription } from './notifications/entities/push-subscription.entity';
import { NotificationBatchJob } from './notifications/entities/notification-batch-job.entity';
import { User } from 'apps/auth-service/src/database/entities/user.entity';
import { CounselorProfile } from 'apps/auth-service/src/database/entities/counselor-profile.entity';
import { UserSession } from 'apps/auth-service/src/database/entities/user-session.entity';
import { OAuthProvider } from 'apps/auth-service/src/database/entities/oauth-provider.entity';
import { join } from 'path';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Prometheus metrics
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: { prefix: 'notification_service_' },
      },
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          Notification,
          NotificationPreference,
          NotificationTemplate,
          PushSubscription,
          NotificationBatchJob,
          User,
          CounselorProfile,
          UserSession,
          OAuthProvider,
        ],
        synchronize: false, // Set to false in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),

    // Redis/Bull for queue management
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB') || 0,
        },
      }),
      inject: [ConfigService],
    }),

    // Email configuration
    MailerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAIL_HOST'),
          port: configService.get('MAIL_PORT') || 465,
          secure: configService.get('MAIL_SECURE') === 'true',
          auth: {
            user: configService.get('MAIL_USER'),
            pass: configService.get('MAIL_PASS'),
          },
        },
        defaults: {
          from:
            configService.get('MAIL_FROM_ADDRESS') ||
            'noreply@mentalhealth.com' +
              ' ' +
              ' ' +
              configService.get('MAIL_FROM_NAME') ||
            'SerenitySpace',
        },
        template: {
          dir: join(__dirname, '/src/templates/email'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
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

    // Scheduled Tasks
    ScheduleModule.forRoot(),

    // JWT
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: {
          expiresIn: process.env.JWT_EXPIRES_IN,
        },
      }),
    }),

    // Feature Modules
    NotificationModule,
    TemplateModule,
    PreferencesModule,
    PassportModule,
    HealthModule,
    DatabaseModule,
    AuthCoreModule,
  ],
  controllers: [NotificationServiceController],
  providers: [PrometheusController],
})
export class NotificationServiceModule {}
