// apps/mood-service/src/mood-entries/mood-entries.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodEntriesController } from './mood-entries.controler';
import { MoodEntriesService } from './mood-entries.service';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([MoodEntry]), RedisModule, AuthModule],
  controllers: [MoodEntriesController],
  providers: [MoodEntriesService],
  exports: [MoodEntriesService],
})
export class MoodEntriesModule {}
