// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Chat entities
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSessionSummary } from '../chat/entities/chat-session-summary.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { MessageAttachment } from '../chat/entities/message-attachment.entity';

// AI entities
import { AiContext } from '../ai/entities/ai-context.entity';

// User-service entities
import { User } from 'apps/auth-service/src/database/entities/user.entity';
import { CounselorProfile } from 'apps/user-service/src/database/entities/counselor-profile.entity';
import { UserSession } from 'apps/user-service/src/database/entities/user-session.entity';
import { OAuthProvider } from 'apps/user-service/src/database/entities/oauth-provider.entity';

// Notification-service entities
import { Notification } from 'apps/notification-service/src/notifications/entities/notification.entity';
import { NotificationBatchJob } from 'apps/notification-service/src/notifications/entities/notification-batch-job.entity';
import { NotificationPreference } from 'apps/notification-service/src/prefrences/entities/notification-prefrence.entity';
import { NotificationTemplate } from 'apps/notification-service/src/templates/entities/notification-template.entity';
import { PushSubscription } from 'apps/notification-service/src/notifications/entities/push-subscription.entity';

const ENTITIES = [
  ChatMessage,
  ChatSessionSummary,
  ChatSession,
  MessageAttachment,
  AiContext,
  User,
  CounselorProfile,
  UserSession,
  OAuthProvider,
  Notification,
  NotificationPreference,
  NotificationTemplate,
  PushSubscription,
  NotificationBatchJob,
];

@Module({
  imports: [
    ConfigModule, // needed for ConfigService injection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: ENTITIES,
        synchronize: false, // Use migrations in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    TypeOrmModule.forFeature(ENTITIES), // make all repositories available for injection
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
