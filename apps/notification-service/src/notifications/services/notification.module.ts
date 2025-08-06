// apps/notification-service/src/notifications/notification.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

import { Notification } from '../entities/notification.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { NotificationBatchJob } from '../entities/notification-batch-job.entity';

import { NotificationService } from '../services/notification.service';
import { NotificationProcessor } from '../processors/notification.processor';
import { NotificationSchedulerService } from './scheduler.service';

import {
  NotificationController,
  NotificationAdminController,
} from './notification.controler';

import { PreferencesModule } from '../../prefrences/services/prefrences.module';
import { TemplateModule } from '../../templates/services/template.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      PushSubscription,
      NotificationBatchJob,
    ]),
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    HttpModule,
    PreferencesModule,
    TemplateModule,
  ],
  controllers: [NotificationController, NotificationAdminController],
  providers: [
    NotificationService,
    NotificationProcessor,
    NotificationSchedulerService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
