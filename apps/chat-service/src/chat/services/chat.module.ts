// apps/chat-service/src/chat/services/chat.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatSession,
      ChatMessage,
      ChatSessionSummary,
      MessageAttachment,
    ]),
    BullModule.registerQueue({
      name: 'message-processing',
    }),
    BullModule.registerQueue({
      name: 'summary-generation',
    }),
    HttpModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, SessionService, MessageService, ChatProcessor],
  exports: [ChatService, SessionService, MessageService, ChatProcessor],
})
export class ChatModule {}
