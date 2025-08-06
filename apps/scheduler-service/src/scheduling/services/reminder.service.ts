import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulingService } from './scheduling.service';
import { NotificationIntegrationService } from './notification-integration.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly notificationIntegrationService: NotificationIntegrationService,
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

    // Get user and counselor names from the meeting relations
    const userName =
      meeting.user?.firstName + ' ' + meeting.user?.lastName || 'User';
    const counselorName =
      meeting.counselor?.firstName + ' ' + meeting.counselor?.lastName ||
      'Counselor';

    const appointmentData = {
      userId: meeting.userId,
      counselorId: meeting.counselorId,
      appointmentId: meeting.id,
      appointmentDate: meeting.scheduledStart.toISOString().split('T')[0],
      appointmentTime: meeting.scheduledStart.toTimeString().slice(0, 5),
      userName,
      counselorName,
      reminderType,
      minutesBefore: reminder.minutesBefore,
    };

    // Send through notification service
    await this.notificationIntegrationService.sendAppointmentReminder(
      appointmentData,
    );
  }
}
