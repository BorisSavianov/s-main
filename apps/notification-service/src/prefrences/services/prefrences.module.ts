// apps/notification-service/src/preferences/services/preferences.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationPreference } from '../entities/notification-prefrence.entity';
import { NotificationPreferencesService } from './notification-prefrences.service';
import { NotificationPreferencesController } from './notification-prefrences.controler';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference])],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService],
  exports: [NotificationPreferencesService],
})
export class PreferencesModule {}
