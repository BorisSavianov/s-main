// apps/mood-service/src/mood-triggers/mood-triggers.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodTriggersController } from './mood-triggers.controller';
import { MoodTriggersService } from './mood-triggers.service';
import { MoodTrigger } from '../database/entities/mood-trigger.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([MoodTrigger]), RedisModule, AuthModule],
  controllers: [MoodTriggersController],
  providers: [MoodTriggersService],
  exports: [MoodTriggersService],
})
export class MoodTriggersModule {}
