// apps/mood-service/src/mood-goals/mood-goals.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodGoalsController } from './mood-goals.controller';
import { MoodGoalsService } from './mood-goals.service';
import { MoodGoal } from '../database/entities/mood-goal.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([MoodGoal]), RedisModule, AuthModule],
  controllers: [MoodGoalsController],
  providers: [MoodGoalsService],
  exports: [MoodGoalsService],
})
export class MoodGoalsModule {}
