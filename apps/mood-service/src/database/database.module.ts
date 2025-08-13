// apps/mood-service/src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodEntry } from './entities/mood-entry.entity';
import { MoodPattern } from './entities/mood-pattern.entity';
import { MoodTrigger } from './entities/mood-trigger.entity';
import { MoodGoal } from './entities/mood-goal.entity';
import { MoodInsight } from './entities/mood-insight.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MoodEntry,
      MoodPattern,
      MoodTrigger,
      MoodGoal,
      MoodInsight,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
