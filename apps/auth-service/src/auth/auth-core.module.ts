import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';

import { User } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { OAuthProvider } from '../database/entities/oauth-provider.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';

import { RedisModule } from '../redis/redis.module';
import { DatabaseModule } from '../database/database.module';

import { UserService } from './user.service';
import { SessionService } from './session.service';
import { OAuthService } from './oauth.service';
import { PasswordService } from './password.service';
import { EmailService } from './email.service';
import { ConfigModule } from '../config/config.module';
import { NotificationClientModule } from 'apps/notification-service/src/clients/client.module';
import { NotificationServiceClient } from 'apps/notification-service/src/clients/notification-service.client';
import { MailerService } from 'apps/notification-service/src/notifications/services/mailer.service';
import { NotificationService } from 'apps/notification-service/src/notifications/services/notification.service';
import { TemplateService } from 'apps/notification-service/src/templates/services/template.service';

import { MailerModule as NestMailerModule } from '@nestjs-modules/mailer';
import { Notification } from 'apps/notification-service/src/notifications/entities/notification.entity';
import { PushSubscription } from 'apps/notification-service/src/notifications/entities/push-subscription.entity';
import { NotificationModule } from 'apps/notification-service/src/notifications/services/notification.module';
import { BullModule } from '@nestjs/bull';
import { NotificationPreferencesService } from 'apps/notification-service/src/prefrences/services/notification-prefrences.service';
import { NotificationTemplate } from 'apps/notification-service/src/templates/entities/notification-template.entity';
import { NotificationPreference } from 'apps/notification-service/src/prefrences/entities/notification-prefrence.entity';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    NotificationModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
    TypeOrmModule.forFeature([
      User,
      UserSession,
      OAuthProvider,
      CounselorProfile,
      Notification,
      PushSubscription,
      NotificationTemplate,
      NotificationPreference,
    ]),
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
      {
        name: 'register',
        ttl: 3600000,
        limit: 30,
      },
    ]),
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    NestMailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST', 'smtp.gmail.com'),
          port: configService.get<number>('MAIL_PORT', 465),
          secure: configService.get<boolean>('MAIL_SECURE', true),
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: `"${configService.get<string>('MAIL_FROM_NAME', 'Chat Service')}" <${configService.get<string>('MAIL_FROM_ADDRESS', 'noreply@example.com')}>`,
        },
        template: {
          dir: join(__dirname, '../templates/email'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
      inject: [ConfigService],
    }),

    ConfigModule,
  ],
  providers: [
    AuthService,
    UserService,
    SessionService,
    OAuthService,
    PasswordService,
    EmailService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    NotificationClientModule,
    NotificationServiceClient,
    MailerService,
    NotificationService,
    TemplateService,
    NotificationPreferencesService,
  ],
  exports: [
    AuthService,
    UserService,
    SessionService,
    JwtStrategy,
    PassportModule,
  ],
})
export class AuthCoreModule {}
