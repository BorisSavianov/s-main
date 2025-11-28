// apps/mood-service/src/mood-ai/mood-ai.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MoodAiService } from './mood-ai.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [MoodAiService],
  exports: [MoodAiService],
})
export class MoodAiModule {}
