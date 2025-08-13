// apps/mood-service/src/mood-patterns/mood-patterns.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodPatternsController } from './mood-patterns.controller';
import { MoodPatternsService } from './mood-patterns.service';
import { MoodPattern } from '../database/entities/mood-pattern.entity';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MoodPattern, MoodEntry]),
    RedisModule,
    AuthModule,
  ],
  controllers: [MoodPatternsController],
  providers: [MoodPatternsService],
  exports: [MoodPatternsService],
})
export class MoodPatternsModule {}
