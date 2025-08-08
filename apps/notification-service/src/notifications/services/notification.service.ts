// apps/notification-service/src/notifications/services/notification.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MailerService } from '@nestjs-modules/mailer';

import {
  Notification,
  NotificationType,
  NotificationStatus,
} from '../entities/notification.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { NotificationPreferencesService } from '../../prefrences/services/notification-prefrences.service';
import { TemplateService } from '../../templates/services/template.service';

import { SendNotificationDto } from '../dtos/send-notification.dto';
import { BulkNotificationDto } from '../dtos/bulk-notification.dto';
import { ScheduleNotificationDto } from '../dtos/schedule-notification.dto';
import { NotificationQueryDto } from '../dtos/notification-query.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(PushSubscription)
    private pushSubscriptionRepository: Repository<PushSubscription>,
    @InjectQueue('notifications')
    private notificationQueue: Queue,
    private mailerService: MailerService,
    private preferencesService: NotificationPreferencesService,
    private templateService: TemplateService,
  ) {}

  // Core notification sending methods
  async sendNotification(
    sendNotificationDto: SendNotificationDto,
  ): Promise<Notification | null> {
    const { userId, type, immediate, ...notificationData } =
      sendNotificationDto;

    // Check user preferences
    const canSend = await this.preferencesService.shouldSendNotification(
      userId,
      sendNotificationDto.category || 'system',
      type,
      new Date(),
    );

    if (!canSend) {
      this.logger.debug(
        `Notification blocked by user preferences for user ${userId}`,
      );
      return null;
    }

    // Create notification record
    const notification = this.notificationRepository.create({
      userId,
      type,
      ...notificationData,
      status: NotificationStatus.PENDING,
      scheduledFor: sendNotificationDto.scheduledFor || new Date(),
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    // Send immediately or queue for later
    if (immediate || !sendNotificationDto.scheduledFor) {
      await this.processNotification(savedNotification.id);
    } else {
      await this.scheduleNotification(
        savedNotification.id,
        sendNotificationDto.scheduledFor,
      );
    }

    return savedNotification;
  }

  async sendBulkNotifications(
    bulkNotificationDto: BulkNotificationDto,
  ): Promise<{ jobId: string; totalCount: number }> {
    const { userIds, ...notificationData } = bulkNotificationDto;

    // Create notifications for all users
    const notifications = userIds.map((userId) => ({
      userId,
      ...notificationData,
      status: NotificationStatus.PENDING,
      scheduledFor: bulkNotificationDto.scheduledFor || new Date(),
    }));

    const savedNotifications =
      await this.notificationRepository.save(notifications);

    // Queue bulk processing job
    const job = await this.notificationQueue.add(
      'bulk-notification',
      {
        notificationIds: savedNotifications.map((n) => n.id),
      },
      {
        delay: bulkNotificationDto.scheduledFor
          ? new Date(bulkNotificationDto.scheduledFor).getTime() - Date.now()
          : 0,
      },
    );

    return {
      jobId: job.id.toString(),
      totalCount: savedNotifications.length,
    };
  }

  async scheduleNotification(
    notificationId: string,
    scheduledFor: Date,
  ): Promise<void> {
    const delay = scheduledFor.getTime() - Date.now();

    if (delay <= 0) {
      await this.processNotification(notificationId);
      return;
    }

    await this.notificationQueue.add(
      'scheduled-notification',
      {
        notificationId,
      },
      { delay },
    );

    this.logger.debug(
      `Scheduled notification ${notificationId} for ${scheduledFor}`,
    );
  }

  // Process individual notification
  async processNotification(notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status !== NotificationStatus.PENDING) {
      this.logger.warn(
        `Notification ${notificationId} is not pending, skipping`,
      );
      return;
    }

    try {
      await this.markNotificationAsProcessing(notificationId);

      switch (notification.type) {
        case NotificationType.EMAIL:
          await this.sendEmailNotification(notification);
          break;
        case NotificationType.IN_APP:
          await this.sendInAppNotification(notification);
          break;
        case NotificationType.SMS:
          await this.sendSMSNotification(notification);
          break;
        case NotificationType.PUSH:
          await this.sendPushNotification(notification);
          break;
        default:
          throw new BadRequestException(
            `Unsupported notification type: ${notification.type}`,
          );
      }

      await this.markNotificationAsSent(notificationId);
      this.logger.log(
        `Successfully sent ${notification.type} notification to user ${notification.userId}`,
      );
    } catch (error) {
      await this.handleNotificationError(notificationId, error);
    }
  }

  // Channel-specific sending methods
  private async sendEmailNotification(
    notification: Notification,
  ): Promise<void> {
    const { user, title, message, data } = notification;

    let emailContent = { subject: title, text: message, html: message };

    // Use template if specified
    if (data?.templateId) {
      const renderedContent = await this.templateService.renderTemplate(
        data.templateId,
        data.templateData || {},
        notification.type,
      );
      emailContent = {
        subject: renderedContent.subject || title,
        text: renderedContent.text || message,
        html: renderedContent.html || message,
      };
    }

    await this.mailerService.sendMail({
      to: user.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      context: data?.templateData || {},
    });
  }

  private async sendInAppNotification(
    notification: Notification,
  ): Promise<void> {
    // For in-app notifications, we just mark as sent
    // The client will poll for unread notifications
    // In a real-world scenario, you might use WebSockets or Server-Sent Events

    // Could emit to WebSocket room for real-time delivery
    // this.socketGateway.emitToUser(notification.userId, 'notification', notification);

    this.logger.debug(
      `In-app notification ${notification.id} ready for user ${notification.userId}`,
    );
  }

  private async sendSMSNotification(notification: Notification): Promise<void> {
    // Placeholder for SMS implementation
    // You would integrate with providers like Twilio, AWS SNS, etc.

    this.logger.warn(
      `SMS notifications not yet implemented. Notification ${notification.id}`,
    );
    throw new BadRequestException('SMS notifications are not yet supported');

    // Example Twilio implementation:
    // await this.twilioClient.messages.create({
    //   body: notification.message,
    //   from: this.configService.get('TWILIO_PHONE_NUMBER'),
    //   to: notification.user.phoneNumber,
    // });
  }

  private async sendPushNotification(
    notification: Notification,
  ): Promise<void> {
    // Placeholder for push notification implementation
    // You would integrate with Web Push, Firebase, etc.

    const subscriptions = await this.pushSubscriptionRepository.find({
      where: { userId: notification.userId, isActive: true },
    });

    if (subscriptions.length === 0) {
      this.logger.warn(
        `No push subscriptions found for user ${notification.userId}`,
      );
      return;
    }

    this.logger.warn(
      `Push notifications not yet implemented. Notification ${notification.id}`,
    );
    throw new BadRequestException('Push notifications are not yet supported');

    // Example Web Push implementation:
    // for (const subscription of subscriptions) {
    //   try {
    //     await webpush.sendNotification({
    //       endpoint: subscription.endpoint,
    //       keys: {
    //         p256dh: subscription.p256dhKey,
    //         auth: subscription.authKey,
    //       }
    //     }, JSON.stringify({
    //       title: notification.title,
    //       body: notification.message,
    //       data: notification.data,
    //     }));
    //   } catch (error) {
    //     this.logger.error(`Failed to send push to subscription ${subscription.id}:`, error);
    //   }
    // }
  }

  // Status management
  private async markNotificationAsProcessing(
    notificationId: string,
  ): Promise<void> {
    await this.notificationRepository.update(notificationId, {
      status: NotificationStatus.PENDING, // Keep as pending during processing
    });
  }

  private async markNotificationAsSent(notificationId: string): Promise<void> {
    await this.notificationRepository.update(notificationId, {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    });
  }

  private async handleNotificationError(
    notificationId: string,
    error: Error,
  ): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) return;

    const newRetryCount = notification.retryCount + 1;
    const shouldRetry = newRetryCount <= notification.maxRetries;

    await this.notificationRepository.update(notificationId, {
      status: shouldRetry
        ? NotificationStatus.PENDING
        : NotificationStatus.FAILED,
      retryCount: newRetryCount,
      errorMessage: error.message,
    });

    if (shouldRetry) {
      // Schedule retry with exponential backoff
      const delay = Math.pow(2, newRetryCount) * 60000; // 2^n minutes
      await this.notificationQueue.add(
        'retry-notification',
        {
          notificationId,
        },
        { delay },
      );

      this.logger.warn(
        `Scheduling retry ${newRetryCount} for notification ${notificationId} in ${delay / 1000}s`,
      );
    } else {
      this.logger.error(
        `Notification ${notificationId} failed permanently:`,
        error,
      );
    }
  }

  // Query methods
  async getUserNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId });

    if (query.type) {
      queryBuilder.andWhere('notification.type = :type', { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere('notification.status = :status', {
        status: query.status,
      });
    }

    if (query.isRead === true) {
      queryBuilder.andWhere('notification.readAt IS NOT NULL');
    } else if (query.isRead === false) {
      queryBuilder.andWhere('notification.readAt IS NULL');
    }

    if (query.startDate) {
      queryBuilder.andWhere('notification.createdAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query.endDate) {
      queryBuilder.andWhere('notification.createdAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip((query.page! - 1) * query.limit!)
      .take(query.limit);

    const notifications = await queryBuilder.getMany();

    // Get unread count
    const unreadCount = await this.notificationRepository.count({
      where: {
        userId,
        readAt: undefined,
        type: query.type ? query.type : undefined,
      },
    });

    return { notifications, total, unreadCount };
  }

  async markNotificationAsRead(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const result = await this.notificationRepository.update(
      { id: notificationId, userId },
      { readAt: new Date() },
    );

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { userId, readAt: undefined },
      { readAt: new Date() },
    );

    return result.affected || 0;
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const result = await this.notificationRepository.delete({
      id: notificationId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  // Integration methods for other services
  async sendAppointmentReminder(appointmentData: {
    userId: string;
    counselorId: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    counselorName: string;
    userName: string;
    reminderType?: string;
    minutesBefore?: number;
  }): Promise<void> {
    const {
      userId,
      counselorId,
      reminderType = 'email',
      ...data
    } = appointmentData;

    // Send reminder to user
    await this.sendNotification({
      userId,
      type: reminderType as NotificationType,
      title: 'Upcoming Appointment Reminder',
      message: `Hi ${data.userName}, you have an appointment with ${data.counselorName} on ${data.appointmentDate} at ${data.appointmentTime}.`,
      category: 'appointments',
      data: {
        appointmentId: data.appointmentId,
        counselorId,
        templateId: 'appointment_reminder',
        templateData: data,
      },
      immediate: true,
    });

    // Send reminder to counselor
    await this.sendNotification({
      userId: counselorId,
      type: reminderType as NotificationType,
      title: 'Upcoming Appointment Reminder',
      message: `You have an appointment with ${data.userName} on ${data.appointmentDate} at ${data.appointmentTime}.`,
      category: 'appointments',
      data: {
        appointmentId: data.appointmentId,
        userId,
        templateId: 'appointment_reminder_counselor',
        templateData: data,
      },
      immediate: true,
    });
  }

  async sendAppointmentConfirmation(appointmentData: {
    userId: string;
    counselorId: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    counselorName: string;
    userName: string;
  }): Promise<void> {
    const { userId, counselorId, ...data } = appointmentData;

    // Notify user
    await this.sendNotification({
      userId,
      type: NotificationType.EMAIL,
      title: 'Appointment Confirmed',
      message: `Your appointment with ${data.counselorName} on ${data.appointmentDate} at ${data.appointmentTime} has been confirmed.`,
      category: 'appointments',
      data: {
        appointmentId: data.appointmentId,
        templateId: 'appointment_confirmed',
        templateData: data,
      },
      immediate: true,
    });

    // Also send in-app notification
    await this.sendNotification({
      userId,
      type: NotificationType.IN_APP,
      title: 'Appointment Confirmed',
      message: `Your appointment with ${data.counselorName} has been confirmed.`,
      category: 'appointments',
      data: { appointmentId: data.appointmentId },
      immediate: true,
    });
  }

  async sendAppointmentCancellation(appointmentData: {
    userId: string;
    counselorId: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    counselorName: string;
    userName: string;
    reason?: string;
    cancelledBy: 'user' | 'counselor';
  }): Promise<void> {
    const { userId, counselorId, cancelledBy, ...data } = appointmentData;

    const recipientId = cancelledBy === 'user' ? counselorId : userId;
    const recipientName =
      cancelledBy === 'user' ? data.counselorName : data.userName;
    const cancellerName =
      cancelledBy === 'user' ? data.userName : data.counselorName;

    await this.sendNotification({
      userId: recipientId,
      type: NotificationType.EMAIL,
      title: 'Appointment Cancelled',
      message: `Your appointment with ${cancellerName} on ${data.appointmentDate} at ${data.appointmentTime} has been cancelled.${data.reason ? ` Reason: ${data.reason}` : ''}`,
      category: 'appointments',
      data: {
        appointmentId: data.appointmentId,
        templateId: 'appointment_cancelled',
        templateData: { ...data, cancelledBy, reason: data.reason },
      },
      immediate: true,
    });

    // Also send in-app notification
    await this.sendNotification({
      userId: recipientId,
      type: NotificationType.IN_APP,
      title: 'Appointment Cancelled',
      message: `Your appointment has been cancelled.`,
      category: 'appointments',
      data: { appointmentId: data.appointmentId },
      immediate: true,
    });
  }

  // Scheduled tasks for processing pending notifications
  async processPendingNotifications(): Promise<void> {
    const pendingNotifications = await this.notificationRepository.find({
      where: {
        status: NotificationStatus.PENDING,
        scheduledFor: LessThanOrEqual(new Date()),
      },
      take: 100, // Process in batches
    });

    this.logger.log(
      `Processing ${pendingNotifications.length} pending notifications`,
    );

    for (const notification of pendingNotifications) {
      try {
        await this.processNotification(notification.id);
      } catch (error) {
        this.logger.error(
          `Failed to process notification ${notification.id}:`,
          error,
        );
      }
    }
  }

  // Analytics and reporting
  async getNotificationStats(userId?: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    pending: number;
    byType: Record<NotificationType, number>;
    byStatus: Record<NotificationStatus, number>;
  }> {
    const whereClause = userId ? { userId } : {};

    const [total, sent, failed, pending] = await Promise.all([
      this.notificationRepository.count({ where: whereClause }),
      this.notificationRepository.count({
        where: { ...whereClause, status: NotificationStatus.SENT },
      }),
      this.notificationRepository.count({
        where: { ...whereClause, status: NotificationStatus.FAILED },
      }),
      this.notificationRepository.count({
        where: { ...whereClause, status: NotificationStatus.PENDING },
      }),
    ]);

    // Get stats by type
    const typeStats = await this.notificationRepository
      .createQueryBuilder('notification')
      .select('notification.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where(userId ? 'notification.userId = :userId' : '1=1', { userId })
      .groupBy('notification.type')
      .getRawMany();

    // Get stats by status
    const statusStats = await this.notificationRepository
      .createQueryBuilder('notification')
      .select('notification.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where(userId ? 'notification.userId = :userId' : '1=1', { userId })
      .groupBy('notification.status')
      .getRawMany();

    const byType = typeStats.reduce((acc, { type, count }) => {
      acc[type] = parseInt(count);
      return acc;
    }, {});

    const byStatus = statusStats.reduce((acc, { status, count }) => {
      acc[status] = parseInt(count);
      return acc;
    }, {});

    return { total, sent, failed, pending, byType, byStatus };
  }
}
