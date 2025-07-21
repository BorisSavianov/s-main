// apps/chat-service/src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

// Entities
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatSessionSummary } from './entities/chat-session-summary.entity';
import { MessageAttachment } from './entities/message-attachment.entity';

// Processors
import { MessageProcessor } from './processors/message.processor';
import { SummaryProcessor } from './processors/summary.processor';

// Services
import { SessionService } from './services/session.service';
import { MessageService } from './services/message.service';
import { AttachmentService } from './services/attachment.service';

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
  providers: [
    ChatService,
    SessionService,
    MessageService,
    AttachmentService,
    MessageProcessor,
    SummaryProcessor,
  ],
  exports: [ChatService, SessionService, MessageService, AttachmentService],
})
export class ChatModule {}
