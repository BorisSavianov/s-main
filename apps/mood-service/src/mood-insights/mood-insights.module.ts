// apps/mood-service/src/mood-insights/mood-insights.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodInsightsController } from './mood-insights.controller';
import { MoodInsightsService } from './mood-insights.service';
import { MoodInsight } from '../database/entities/mood-insight.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([MoodInsight]), RedisModule, AuthModule],
  controllers: [MoodInsightsController],
  providers: [MoodInsightsService],
  exports: [MoodInsightsService],
})
export class MoodInsightsModule {}
