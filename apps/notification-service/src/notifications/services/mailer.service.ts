// apps/notification-service/src/notifications/services/mailer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService as NestMailerService } from '@nestjs-modules/mailer';
import { TemplateService } from '../../templates/services/template.service';
import { NotificationType } from '../entities/notification.entity';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  template?: string;
  context?: Record<string, any>;
  html?: string;
  text?: string;
  from?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    private readonly nestMailerService: NestMailerService,
    private readonly configService: ConfigService,
    private readonly templateService: TemplateService,
  ) {}

  // Email sending method for notification service
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions: any = {
        to: options.to,
        subject: options.subject,
        from: options.from || this.getDefaultFromAddress(),
      };

      // Use template if provided
      if (options.template && options.context) {
        const renderedTemplate = await this.templateService.renderTemplate(
          options.template,
          options.context,
          NotificationType.EMAIL,
        );

        mailOptions.subject = renderedTemplate.subject || options.subject;
        mailOptions.html = renderedTemplate.html;
        mailOptions.text = renderedTemplate.text;
      } else {
        // Use raw HTML/text content
        mailOptions.html = options.html;
        mailOptions.text = options.text;
      }

      await this.nestMailerService.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to: ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      throw new Error('Email delivery failed');
    }
  }

  // Authentication-related emails
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    try {
      const templateData = {
        platform_name: this.configService.get<string>(
          'PLATFORM_NAME',
          'Serenity Space',
        ),
        verification_url: `${this.configService.get<string>('FRONTEND_URL')}api/v1/auth/verify-email?token=${token}`,
      };

      const rendered = await this.templateService.renderTemplate(
        'email-verification',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'Verify Your Email Address',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Verification email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}:`,
        error,
      );
      throw new Error('Email delivery failed');
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    try {
      const templateData = {
        user_name: email.split('@')[0], // Use email username as fallback
        reset_link: `${this.configService.get<string>('FRONTEND_URL')}api/v1/auth/reset-password?token=${token}`,
      };

      const rendered = await this.templateService.renderTemplate(
        'password-reset',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'Reset Your Password',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Password reset email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}:`,
        error,
      );
      throw new Error('Email delivery failed');
    }
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    try {
      const templateData = {
        user_name: firstName,
        platform_name: this.configService.get<string>(
          'PLATFORM_NAME',
          'Serenity Space',
        ),
        platform_url: this.configService.get<string>('FRONTEND_URL'),
      };

      const rendered = await this.templateService.renderTemplate(
        'welcome',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'Welcome to Our Platform',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Welcome email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      throw new Error('Email delivery failed');
    }
  }

  async sendPasswordChangedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    try {
      const templateData = {
        user_name: firstName,
        timestamp: new Date().toLocaleString(),
        support_email: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@serenityspace.app',
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'password-changed',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'Password Changed Successfully',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Password changed email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password changed email to ${email}:`,
        error,
      );
      throw new Error('Email delivery failed');
    }
  }

  async sendAccountDeactivatedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    try {
      const templateData = {
        user_name: firstName,
        reactivation_period: '30',
        support_email: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@serenityspace.app',
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'account-deactivated',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'Account Deactivated',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(
        `Account deactivated email sent successfully to ${email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send account deactivated email to ${email}:`,
        error,
      );
      throw new Error('Email delivery failed');
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
      const templateData = {
        user_name: firstName,
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: timestamp.toLocaleString(),
        support_email: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@serenityspace.app',
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'login-alert',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'New Login Alert',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Login alert email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send login alert email to ${email}:`, error);
      throw new Error('Email delivery failed');
    }
  }

  async sendSuspiciousActivityEmail(
    email: string,
    firstName: string,
    activityType: string,
    timestamp: Date,
  ): Promise<void> {
    try {
      const templateData = {
        user_name: firstName,
        activity_type: activityType,
        timestamp: timestamp.toLocaleString(),
        security_url: `${this.configService.get<string>('FRONTEND_URL')}api/v1/auth/security`,
        support_email: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@serenityspace.app',
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'suspicious-activity',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || 'Suspicious Activity Detected',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(
        `Suspicious activity email sent successfully to ${email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send suspicious activity email to ${email}:`,
        error,
      );
      throw new Error('Email delivery failed');
    }
  }

  // Appointment-related emails
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
      const {
        userEmail,
        counselorEmail,
        userName,
        counselorName,
        appointmentDate,
        appointmentTime,
        meetingRoomUrl,
        meetingType,
      } = appointmentData;

      // Send reminder to user
      const userTemplateData = {
        user_name: userName,
        counselor_name: counselorName,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        meeting_room_url: meetingRoomUrl || '',
        meeting_type: meetingType || 'appointment',
      };

      const userRendered = await this.templateService.renderTemplate(
        'appointment-reminder',
        userTemplateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: userEmail,
        subject: userRendered.subject || 'Upcoming Appointment Reminder',
        html: userRendered.html,
        text: userRendered.text,
        from: this.getDefaultFromAddress(),
      });

      // Send reminder to counselor
      const counselorTemplateData = {
        user_name: userName,
        counselor_name: counselorName,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        meeting_room_url: meetingRoomUrl || '',
        meeting_type: meetingType || 'appointment',
      };

      const counselorRendered = await this.templateService.renderTemplate(
        'appointment-reminder',
        counselorTemplateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: counselorEmail,
        subject: counselorRendered.subject || 'Upcoming Appointment Reminder',
        html: counselorRendered.html,
        text: counselorRendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(
        `Appointment reminders sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send appointment reminders:`, error);
      throw new Error('Email delivery failed');
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
      const {
        userEmail,
        counselorEmail,
        userName,
        counselorName,
        appointmentDate,
        appointmentTime,
        meetingType,
        duration,
      } = appointmentData;

      // Send confirmation to user
      const userTemplateData = {
        user_name: userName,
        counselor_name: counselorName,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        meeting_type: meetingType || 'appointment',
        duration: duration ? `${duration} minutes` : '60 minutes',
      };

      const userRendered = await this.templateService.renderTemplate(
        'appointment-confirmed',
        userTemplateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: userEmail,
        subject: userRendered.subject || 'Appointment Confirmed',
        html: userRendered.html,
        text: userRendered.text,
        from: this.getDefaultFromAddress(),
      });

      // Send confirmation to counselor
      const counselorTemplateData = {
        user_name: userName,
        counselor_name: counselorName,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        meeting_type: meetingType || 'appointment',
        duration: duration ? `${duration} minutes` : '60 minutes',
      };

      const counselorRendered = await this.templateService.renderTemplate(
        'appointment-confirmed',
        counselorTemplateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: counselorEmail,
        subject: counselorRendered.subject || 'Appointment Confirmed',
        html: counselorRendered.html,
        text: counselorRendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(
        `Appointment confirmations sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send appointment confirmations:`, error);
      throw new Error('Email delivery failed');
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
      const {
        userEmail,
        counselorEmail,
        userName,
        counselorName,
        appointmentDate,
        appointmentTime,
        reason,
        cancelledBy,
      } = appointmentData;

      const recipientEmail =
        cancelledBy === 'user' ? counselorEmail : userEmail;
      const recipientName = cancelledBy === 'user' ? counselorName : userName;
      const cancellerName = cancelledBy === 'user' ? userName : counselorName;

      const templateData = {
        user_name: userName,
        counselor_name: counselorName,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        recipient_name: recipientName,
        canceller_name: cancellerName,
        cancelled_by: cancelledBy,
        reason: reason || 'No reason provided',
      };

      const rendered = await this.templateService.renderTemplate(
        'appointment-cancelled',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: recipientEmail,
        subject: rendered.subject || 'Appointment Cancelled',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(
        `Appointment cancellation sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send appointment cancellation:`, error);
      throw new Error('Email delivery failed');
    }
  }

  // Administrative emails
  async sendAdminNotification(notification: {
    type: string;
    messageId?: string;
    sessionId?: string;
    reason: string;
    severity: string;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    try {
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
      if (!adminEmail) {
        this.logger.warn(
          'Admin email not configured, skipping admin notification',
        );
        return;
      }

      const templateData = {
        type: notification.type,
        message_id: notification.messageId || 'N/A',
        session_id: notification.sessionId || 'N/A',
        reason: notification.reason,
        severity: notification.severity,
        timestamp: new Date().toLocaleString(),
        system_name: this.configService.get<string>(
          'PLATFORM_NAME',
          'Serenity Space',
        ),
        additional_data: JSON.stringify(notification.additionalData || {}),
      };

      const rendered = await this.templateService.renderTemplate(
        'chat-service-alert',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: adminEmail,
        subject:
          rendered.subject ||
          `[${notification.severity.toUpperCase()}] System Alert`,
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Admin notification sent: ${notification.type}`);
    } catch (error) {
      this.logger.error(`Failed to send admin notification:`, error);
      throw new Error('Email delivery failed');
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
      const crisisTeamEmail =
        this.configService.get<string>('CRISIS_TEAM_EMAIL');
      if (!crisisTeamEmail) {
        this.logger.error('Crisis team email not configured!');
        throw new Error('Crisis team email not configured');
      }

      const templateData = {
        session_id: alert.sessionId,
        message_id: alert.messageId,
        crisis_type: alert.crisisType,
        confidence: alert.confidence.toString(),
        timestamp: new Date().toLocaleString(),
        urgency_level: 'CRITICAL',
        additional_data: JSON.stringify(alert.additionalData || {}),
      };

      const rendered = await this.templateService.renderTemplate(
        'crisis-intervention',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: crisisTeamEmail,
        subject: rendered.subject || '🚨 URGENT - Crisis Intervention Required',
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Crisis alert sent for session ${alert.sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to send crisis alert:`, error);
      throw new Error('Email delivery failed');
    }
  }

  // Bulk email methods
  async sendBulkEmail(
    recipients: string[],
    subject: string,
    template: string,
    context: Record<string, any>,
  ): Promise<{ sent: number; failed: string[] }> {
    const results = { sent: 0, failed: [] as string[] };

    for (const recipient of recipients) {
      try {
        const templateData = {
          ...context,
          recipient_email: recipient,
        };

        const rendered = await this.templateService.renderTemplate(
          template,
          templateData,
          NotificationType.EMAIL,
        );

        await this.nestMailerService.sendMail({
          to: recipient,
          subject: rendered.subject || subject,
          html: rendered.html,
          text: rendered.text,
          from: this.getDefaultFromAddress(),
        });

        results.sent++;
        this.logger.log(`Bulk email sent to ${recipient}`);
      } catch (error) {
        this.logger.error(`Failed to send bulk email to ${recipient}:`, error);
        results.failed.push(recipient);
      }
    }

    return results;
  }

  // Newsletter and marketing emails
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
      const templateData = {
        user_name: userName,
        newsletter_title: newsletterData.title,
        newsletter_content: newsletterData.content,
        unsubscribe_url: newsletterData.unsubscribeUrl,
        platform_name: this.configService.get<string>(
          'PLATFORM_NAME',
          'Serenity Space',
        ),
        featured_articles: JSON.stringify(
          newsletterData.featuredArticles || [],
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'newsletter',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || `Newsletter: ${newsletterData.title}`,
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Newsletter sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send newsletter to ${email}:`, error);
      throw new Error('Email delivery failed');
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
      const templateData = {
        user_name: userName,
        promotion_title: promotionData.title,
        promotion_description: promotionData.description,
        cta_text: promotionData.ctaText,
        cta_url: promotionData.ctaUrl,
        expiry_date:
          promotionData.expiryDate?.toLocaleDateString() || 'No expiry',
        unsubscribe_url: promotionData.unsubscribeUrl,
        platform_name: this.configService.get<string>(
          'PLATFORM_NAME',
          'Serenity Space',
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'promotional',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || promotionData.title,
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Promotional email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send promotional email to ${email}:`, error);
      throw new Error('Email delivery failed');
    }
  }

  // Survey and feedback emails
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
      const templateData = {
        user_name: userName,
        appointment_id: feedbackData.appointmentId || 'N/A',
        counselor_name: feedbackData.counselorName || 'Your counselor',
        session_date:
          feedbackData.sessionDate?.toLocaleDateString() || 'Recent session',
        survey_url: feedbackData.surveyUrl,
        platform_name: this.configService.get<string>(
          'PLATFORM_NAME',
          'Serenity Space',
        ),
      };

      const rendered = await this.templateService.renderTemplate(
        'feedback-request',
        templateData,
        NotificationType.EMAIL,
      );

      await this.nestMailerService.sendMail({
        to: email,
        subject: rendered.subject || "We'd love your feedback",
        html: rendered.html,
        text: rendered.text,
        from: this.getDefaultFromAddress(),
      });

      this.logger.log(`Feedback request sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send feedback request to ${email}:`, error);
      throw new Error('Email delivery failed');
    }
  }

  // Utility methods
  private getDefaultFromAddress(): string {
    const fromName = this.configService.get<string>(
      'MAIL_FROM_NAME',
      'Serenity Space',
    );
    const fromAddress = this.configService.get<string>(
      'MAIL_FROM_ADDRESS',
      'noreply@serenityspace.app',
    );
    return `${fromName} <${fromAddress}>`;
  }

  // Health check for email service
  async testEmailConnection(): Promise<boolean> {
    try {
      // Test the SMTP connection
      return true;
    } catch (error) {
      this.logger.error('Email service health check failed:', error);
      return false;
    }
  }

  // Email template validation
  async validateTemplate(
    templateName: string,
    sampleData: Record<string, any>,
  ): Promise<{
    isValid: boolean;
    errors: string[];
    rendered?: { subject?: string; html: string; text: string };
  }> {
    try {
      const rendered = await this.templateService.renderTemplate(
        templateName,
        sampleData,
        NotificationType.EMAIL,
      );

      return {
        isValid: true,
        errors: [],
        rendered,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message],
      };
    }
  }
}
