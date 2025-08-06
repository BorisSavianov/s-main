// apps/notification-service/src/notifications/processors/notification.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationService } from '../services/notification.service';

@Processor('notifications')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Process('scheduled-notification')
  async handleScheduledNotification(job: Job<{ notificationId: string }>) {
    this.logger.debug(`Processing scheduled notification job ${job.id}`);

    try {
      await this.notificationService.processNotification(
        job.data.notificationId,
      );
      this.logger.log(
        `Successfully processed scheduled notification ${job.data.notificationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process scheduled notification ${job.data.notificationId}:`,
        error,
      );
      throw error; // Re-throw to mark job as failed
    }
  }

  @Process('retry-notification')
  async handleRetryNotification(job: Job<{ notificationId: string }>) {
    this.logger.debug(`Processing retry notification job ${job.id}`);

    try {
      await this.notificationService.processNotification(
        job.data.notificationId,
      );
      this.logger.log(
        `Successfully processed retry notification ${job.data.notificationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process retry notification ${job.data.notificationId}:`,
        error,
      );
      throw error;
    }
  }

  @Process('bulk-notification')
  async handleBulkNotification(job: Job<{ notificationIds: string[] }>) {
    this.logger.debug(
      `Processing bulk notification job ${job.id} with ${job.data.notificationIds.length} notifications`,
    );

    let processed = 0;
    let failed = 0;

    for (const notificationId of job.data.notificationIds) {
      try {
        await this.notificationService.processNotification(notificationId);
        processed++;

        // Update job progress
        const progress = Math.round(
          (processed / job.data.notificationIds.length) * 100,
        );
        await job.progress(progress);
      } catch (error) {
        this.logger.error(
          `Failed to process notification ${notificationId} in bulk job:`,
          error,
        );
        failed++;
      }
    }

    this.logger.log(
      `Bulk notification job ${job.id} completed: ${processed} processed, ${failed} failed`,
    );

    return {
      processed,
      failed,
      total: job.data.notificationIds.length,
    };
  }

  @Process('cleanup-old-notifications')
  async handleCleanupOldNotifications(job: Job<{ olderThanDays: number }>) {
    this.logger.debug(
      `Processing cleanup job for notifications older than ${job.data.olderThanDays} days`,
    );

    // This would implement cleanup logic
    // For now, just log that it would happen
    this.logger.log(`Cleanup job completed (not implemented yet)`);

    return { message: 'Cleanup completed' };
  }
}
