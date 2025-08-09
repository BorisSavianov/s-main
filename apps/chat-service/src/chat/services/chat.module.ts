// apps/chat-service/src/chat/services/chat.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';

import { ChatController } from './chat.controler';
import { ChatService } from './chat.service';

// Entities
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { AiContext } from '../../ai/entities/ai-context.entity';

// Processors
import { ChatProcessor } from '../processors/chat.processor';

// Services
import { SessionService } from './session.service';
import { MessageService } from './message.service';
import { AIService } from '../../ai/ai.service';

// Import guards and strategies from auth-service
import { JwtAuthGuard } from '../../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth-service/src/auth/guards/roles.guard';
import { LocalAuthGuard } from '../../../../auth-service/src/auth/guards/local-auth.guard';
import { RefreshTokenGuard } from '../../../../auth-service/src/auth/guards/refresh-token.guard';
import { JwtStrategy } from '../../../../auth-service/src/auth/strategies/jwt.strategy';
import { RefreshTokenStrategy } from '../../../../auth-service/src/auth/strategies/refresh-token.strategy';
import { RedisModule } from 'apps/auth-service/src/redis/redis.module';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';
import { NotificationModule } from 'apps/notification-service/src/notifications/services/notification.module';

@Module({
  imports: [
    AuthCoreModule,
    RedisModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      ChatSession,
      ChatMessage,
      ChatSessionSummary,
      MessageAttachment,
      AiContext,
    ]),

    // Bull queues for background processing
    BullModule.registerQueue({
      name: 'message-processing',
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 10,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    BullModule.registerQueue({
      name: 'summary-generation',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000,
        },
      },
    }),
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
    BullModule.registerQueue({
      name: 'chat-processing',
    }),

    // HTTP module
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),

    // JWT module for authentication
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

    // Passport for authentication strategies
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Rate limiting specifically for chat endpoints
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'chat-default',
            ttl: configService.get<number>('CHAT_THROTTLE_TTL', 60000), // 1 minute
            limit: configService.get<number>('CHAT_THROTTLE_LIMIT', 100), // 100 requests
          },
          {
            name: 'chat-messages',
            ttl: configService.get<number>('MESSAGE_THROTTLE_TTL', 60000), // 1 minute
            limit: configService.get<number>('MESSAGE_THROTTLE_LIMIT', 30), // 30 messages
          },
          {
            name: 'chat-sessions',
            ttl: configService.get<number>('SESSION_THROTTLE_TTL', 300000), // 5 minutes
            limit: configService.get<number>('SESSION_THROTTLE_LIMIT', 10), // 10 sessions
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Event emitter for internal events
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // Mailer configuration
    MailerModule.forRootAsync({
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
          dir: join(__dirname, '..', '..', '..', 'templates', 'email'),
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
  controllers: [ChatController],
  providers: [
    ChatService,
    SessionService,
    MessageService,
    ChatProcessor,
    AIService,
    EventEmitter2,

    // Authentication strategies
    JwtStrategy,
    RefreshTokenStrategy,

    // Guards
    JwtAuthGuard,
    RolesGuard,
    LocalAuthGuard,
    RefreshTokenGuard,
  ],
  exports: [
    ChatService,
    SessionService,
    MessageService,
    ChatProcessor,
    AIService,
    EventEmitter2,

    // Export guards for use in other modules
    JwtAuthGuard,
    RolesGuard,
    LocalAuthGuard,
    RefreshTokenGuard,

    // Export JWT module for WebSocket module
    JwtModule,
  ],
})
export class ChatModule {}
