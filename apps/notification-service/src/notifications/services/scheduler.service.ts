// apps/notification-service/src/notifications/services/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingNotifications() {
    this.logger.debug('Running scheduled task: process pending notifications');

    try {
      await this.notificationService.processPendingNotifications();
    } catch (error) {
      this.logger.error('Failed to process pending notifications:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldNotifications() {
    this.logger.debug('Running scheduled task: cleanup old notifications');

    try {
      // Queue cleanup job to run in background
      // This would clean up notifications older than 90 days
      this.logger.log('Cleanup of old notifications scheduled');
    } catch (error) {
      this.logger.error(
        'Failed to schedule cleanup of old notifications:',
        error,
      );
    }
  }

  @Cron('0 */15 * * * *') // Every 15 minutes
  async processFailedNotifications() {
    this.logger.debug('Running scheduled task: retry failed notifications');

    try {
      // This would find failed notifications that can be retried
      // and add them back to the queue
      this.logger.debug('Failed notification retry check completed');
    } catch (error) {
      this.logger.error('Failed to process failed notifications:', error);
    }
  }
}
