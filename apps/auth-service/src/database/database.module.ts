// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { OAuthProvider } from './entities/oauth-provider.entity';
import { CounselorProfile } from './entities/counselor-profile.entity';

import { Notification } from 'apps/notification-service/src/notifications/entities/notification.entity';
import { PushSubscription } from 'apps/notification-service/src/notifications/entities/push-subscription.entity';
import { NotificationTemplate } from 'apps/notification-service/src/templates/entities/notification-template.entity';
import { NotificationPreference } from 'apps/notification-service/src/prefrences/entities/notification-prefrence.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          User,
          UserSession,
          OAuthProvider,
          CounselorProfile,
          Notification,
          PushSubscription,
          NotificationTemplate,
          NotificationPreference,
        ],
        synchronize: false, // Set to false in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      UserSession,
      OAuthProvider,
      CounselorProfile,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
