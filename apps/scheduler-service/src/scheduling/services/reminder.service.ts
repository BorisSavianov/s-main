// src/scheduling/services/reminder.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulingService } from './scheduling.service';
//import { NotificationService } from '../../notifications/notification.service'; // Assume this exists

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly schedulingService: SchedulingService,
    // private readonly notificationService: NotificationService, // Inject your notification service
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingReminders() {
    try {
      const pendingReminders =
        await this.schedulingService.getPendingReminders();

      this.logger.log(
        `Processing ${pendingReminders.length} pending reminders`,
      );

      for (const reminder of pendingReminders) {
        try {
          await this.sendReminder(reminder);
          await this.schedulingService.markReminderAsSent(reminder.id);
          this.logger.log(
            `Sent reminder ${reminder.id} to user ${reminder.recipientId}`,
          );
        } catch (error) {
          this.logger.error(`Failed to send reminder ${reminder.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process pending reminders:', error);
    }
  }

  private async sendReminder(reminder: any) {
    const { reminderType, recipient, meeting, title, message } = reminder;

    const notificationData = {
      userId: recipient.id,
      title: title || `Meeting Reminder: ${meeting.title}`,
      message:
        message || `Your meeting is scheduled for ${meeting.scheduledStart}`,
      type: reminderType,
      data: {
        meetingId: meeting.id,
        reminderId: reminder.id,
      },
    };

    // switch (reminderType) {
    //   case 'email':
    //     await this.notificationService.sendEmail(notificationData);
    //     break;
    //   case 'sms':
    //     await this.notificationService.sendSMS(notificationData);
    //     break;
    //   case 'push':
    //     await this.notificationService.sendPushNotification(notificationData);
    //     break;
    //   case 'in_app':
    //     await this.notificationService.sendInAppNotification(notificationData);
    //     break;
    // }
  }
}
