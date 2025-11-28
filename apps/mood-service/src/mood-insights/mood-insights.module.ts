// apps/mood-service/src/mood-insights/mood-insights.module.ts
// apps/mood-service/src/mood-insights/mood-insights.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodInsightsController } from './mood-insights.controller';
import { MoodInsightsService } from './mood-insights.service';
import { MoodInsight } from '../database/entities/mood-insight.entity';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';
import { MoodAiModule } from '../mood-ai/mood-ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MoodInsight, MoodEntry]),
    RedisModule,
    AuthModule,
    MoodAiModule,
  ],
  controllers: [MoodInsightsController],
  providers: [MoodInsightsService],
  exports: [MoodInsightsService],
})
export class MoodInsightsModule {}
