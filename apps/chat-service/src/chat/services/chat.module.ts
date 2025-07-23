// apps/chat-service/src/chat/services/chat.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
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

// Processors
import { ChatProcessor } from '../processors/chat.processor';

// Services
import { SessionService } from './session.service';
import { MessageService } from './message.service';
import { AIService } from '../../ai/ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiContext } from '../../ai/entities/ai-context.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatSession,
      ChatMessage,
      ChatSessionSummary,
      MessageAttachment,
      AiContext,
    ]),
    BullModule.registerQueue({
      name: 'message-processing',
    }),
    BullModule.registerQueue({
      name: 'summary-generation',
    }),
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
    HttpModule,
    // Add MailerModule configuration
    MailerModule.forRoot({
      transport: {
        host: process.env.MAIL_HOST || 'localhost',
        port: parseInt(process.env.MAIL_PORT!) || 587,
        secure: process.env.MAIL_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      },
      defaults: {
        from: `"${process.env.MAIL_FROM_NAME || 'Chat Service'}" <${process.env.MAIL_FROM_ADDRESS || 'noreply@example.com'}>`,
      },
      template: {
        dir: join(__dirname, '../../templates/email'),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    SessionService,
    MessageService,
    ChatProcessor,
    AIService,
    // Remove MailerService from providers - it's provided by MailerModule
    EventEmitter2,
  ],
  exports: [
    ChatService,
    SessionService,
    MessageService,
    ChatProcessor,
    AIService,
    // Remove MailerService from exports - import MailerService where needed
    EventEmitter2,
  ],
})
export class ChatModule {}
