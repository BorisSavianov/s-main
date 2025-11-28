import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodPatternsController } from './mood-patterns.controller';
import { MoodPatternsService } from './mood-patterns.service';
import { MoodPattern } from '../database/entities/mood-pattern.entity';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { MoodInsight } from '../database/entities/mood-insight.entity';
import { MoodGoal } from '../database/entities/mood-goal.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';

import { MoodAiModule } from '../mood-ai/mood-ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MoodPattern, MoodEntry, MoodInsight, MoodGoal]),
    RedisModule,
    AuthModule,
    MoodAiModule,
  ],
  controllers: [MoodPatternsController],
  providers: [MoodPatternsService],
  exports: [MoodPatternsService],
})
export class MoodPatternsModule {}
