// apps/chat-service/src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';

import { AIService } from './ai.service';
import { AIController } from './ai.controler';
import { AiContext } from './entities/ai-context.entity';

// Processors
import { AIProcessor } from './processors/ai.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiContext]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
  ],
  controllers: [AIController],
  providers: [AIService, AIProcessor],
  exports: [AIService],
})
export class AiModule {}
