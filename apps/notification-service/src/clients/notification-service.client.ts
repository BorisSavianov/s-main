// apps/notification-service/src/clients/notification-service.client.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../notifications/services/mailer.service';
import { NotificationService } from '../notifications/services/notification.service';
import { INotificationService } from 'shared/interfaces/notification-service.interface';
/**
 * Client wrapper for the notification service that can be used by other services
 * This provides a clean interface and handles any service-specific logic
 */
@Injectable()
export class NotificationServiceClient implements INotificationService {
  private readonly logger = new Logger(NotificationServiceClient.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  // Authentication-related notifications
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    try {
      await this.mailerService.sendVerificationEmail(email, token);
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}:`,
        error,
      );
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    try {
      await this.mailerService.sendPasswordResetEmail(email, token);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}:`,
        error,
      );
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    try {
      await this.mailerService.sendWelcomeEmail(email, firstName);
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      throw error;
    }
  }

  async sendPasswordChangedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendPasswordChangedEmail(email, firstName);
      this.logger.log(`Password changed email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password changed email to ${email}:`,
        error,
      );
      throw error;
    }
  }

  async sendLoginAlertEmail(
    email: string,
    firstName: string,
    ipAddress: string,
    userAgent: string,
    timestamp: Date,
  ): Promise<void> {
    try {
      await this.mailerService.sendLoginAlertEmail(
        email,
        firstName,
        ipAddress,
        userAgent,
        timestamp,
      );
      this.logger.log(`Login alert email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send login alert email to ${email}:`, error);
      throw error;
    }
  }

  async sendSuspiciousActivityEmail(
    email: string,
    firstName: string,
    activityType: string,
    timestamp: Date,
  ): Promise<void> {
    try {
      await this.mailerService.sendSuspiciousActivityEmail(
        email,
        firstName,
        activityType,
        timestamp,
      );
      this.logger.log(`Suspicious activity email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send suspicious activity email to ${email}:`,
        error,
      );
      throw error;
    }
  }

  // Appointment-related notifications
  async sendAppointmentReminder(appointmentData: {
    userEmail: string;
    userName: string;
    counselorEmail: string;
    counselorName: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    meetingRoomUrl?: string;
    minutesBefore?: number;
    meetingType?: string;
  }): Promise<void> {
    try {
      await this.mailerService.sendAppointmentReminder(appointmentData);
      this.logger.log(
        `Appointment reminder sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send appointment reminder:`, error);
      throw error;
    }
  }

  async sendAppointmentConfirmation(appointmentData: {
    userEmail: string;
    userName: string;
    counselorEmail: string;
    counselorName: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    meetingType?: string;
    duration?: number;
  }): Promise<void> {
    try {
      await this.mailerService.sendAppointmentConfirmation(appointmentData);
      this.logger.log(
        `Appointment confirmation sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send appointment confirmation:`, error);
      throw error;
    }
  }

  async sendAppointmentCancellation(appointmentData: {
    userEmail: string;
    userName: string;
    counselorEmail: string;
    counselorName: string;
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
    cancelledBy: 'user' | 'counselor';
  }): Promise<void> {
    try {
      await this.mailerService.sendAppointmentCancellation(appointmentData);
      this.logger.log(
        `Appointment cancellation sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send appointment cancellation:`, error);
      throw error;
    }
  }

  // System notifications
  async sendAdminNotification(notification: {
    type: string;
    messageId?: string;
    sessionId?: string;
    reason: string;
    severity: string;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.mailerService.sendAdminNotification(notification);
      this.logger.log(`Admin notification sent: ${notification.type}`);
    } catch (error) {
      this.logger.error(`Failed to send admin notification:`, error);
      throw error;
    }
  }

  async sendCrisisAlert(alert: {
    sessionId: string;
    messageId: string;
    crisisType: string;
    confidence: number;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.mailerService.sendCrisisAlert(alert);
      this.logger.log(`Crisis alert sent for session ${alert.sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to send crisis alert:`, error);
      throw error;
    }
  }

  // Bulk operations
  async sendBulkEmail(data: {
    userEmails: string[];
    subject: string;
    template: string;
    context: Record<string, any>;
  }): Promise<{ sent: number; failed: string[] }> {
    try {
      const result = await this.mailerService.sendBulkEmail(
        data.userEmails,
        data.subject,
        data.template,
        data.context,
      );
      this.logger.log(
        `Bulk email sent: ${result.sent} successful, ${result.failed.length} failed`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Failed to send bulk email:`, error);
      throw error;
    }
  }

  // Health check
  async testEmailConnection(): Promise<{
    isHealthy: boolean;
    message: string;
  }> {
    try {
      const result = await this.mailerService.testEmailConnection();
      this.logger.log(
        `Email health check: ${result ? 'healthy' : 'unhealthy'}`,
      );
      return {
        isHealthy: result,
        message: result
          ? 'Email service is working'
          : 'Email service is not responding',
      };
    } catch (error) {
      this.logger.error(`Email health check failed:`, error);
      return {
        isHealthy: false,
        message: `Email service error: ${error.message}`,
      };
    }
  }

  // Additional utility methods
  async validateEmailTemplate(
    templateName: string,
    sampleData: Record<string, any>,
  ): Promise<{
    isValid: boolean;
    errors: string[];
    rendered?: { subject?: string; html: string; text: string };
  }> {
    try {
      return await this.mailerService.validateTemplate(
        templateName,
        sampleData,
      );
    } catch (error) {
      this.logger.error(`Template validation failed:`, error);
      return {
        isValid: false,
        errors: [error.message],
      };
    }
  }

  // Newsletter and promotional emails
  async sendNewsletterEmail(
    email: string,
    userName: string,
    newsletterData: {
      title: string;
      content: string;
      unsubscribeUrl: string;
      featuredArticles?: Array<{ title: string; url: string; excerpt: string }>;
    },
  ): Promise<void> {
    try {
      await this.mailerService.sendNewsletterEmail(
        email,
        userName,
        newsletterData,
      );
      this.logger.log(`Newsletter sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send newsletter to ${email}:`, error);
      throw error;
    }
  }

  async sendPromotionalEmail(
    email: string,
    userName: string,
    promotionData: {
      title: string;
      description: string;
      ctaText: string;
      ctaUrl: string;
      expiryDate?: Date;
      unsubscribeUrl: string;
    },
  ): Promise<void> {
    try {
      await this.mailerService.sendPromotionalEmail(
        email,
        userName,
        promotionData,
      );
      this.logger.log(`Promotional email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send promotional email to ${email}:`, error);
      throw error;
    }
  }

  async sendFeedbackRequestEmail(
    email: string,
    userName: string,
    feedbackData: {
      appointmentId?: string;
      counselorName?: string;
      sessionDate?: Date;
      surveyUrl: string;
    },
  ): Promise<void> {
    try {
      await this.mailerService.sendFeedbackRequestEmail(
        email,
        userName,
        feedbackData,
      );
      this.logger.log(`Feedback request sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send feedback request to ${email}:`, error);
      throw error;
    }
  }
}
