// apps/notification-service/src/mailer/mailer.service.ts
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

  // Core email sending method
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
    const verificationUrl = `${this.configService.get<string>('FRONTEND_URL')}/verify-email?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Verify Your Email Address',
      template: 'email-verification',
      context: {
        verificationUrl,
        platformName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Reset Your Password',
      template: 'password-reset',
      context: {
        resetUrl,
        platformName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
      },
    });
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Welcome to Our Mental Health Platform',
      template: 'welcome',
      context: {
        userName: firstName,
        platformName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
        platformUrl: this.configService.get<string>('FRONTEND_URL'),
      },
    });
  }

  async sendPasswordChangedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Password Changed Successfully',
      template: 'password-changed',
      context: {
        userName: firstName,
        timestamp: new Date(),
        supportEmail: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@mentalhealth.com',
        ),
      },
    });
  }

  async sendAccountDeactivatedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Account Deactivated',
      template: 'account-deactivated',
      context: {
        userName: firstName,
        supportEmail: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@mentalhealth.com',
        ),
        reactivationPeriod: 30, // days
      },
    });
  }

  async sendLoginAlertEmail(
    email: string,
    firstName: string,
    ipAddress: string,
    userAgent: string,
    timestamp: Date,
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'New Login Alert',
      template: 'login-alert',
      context: {
        userName: firstName,
        ipAddress,
        userAgent,
        timestamp,
        supportEmail: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@mentalhealth.com',
        ),
      },
    });
  }

  async sendSuspiciousActivityEmail(
    email: string,
    firstName: string,
    activityType: string,
    timestamp: Date,
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Suspicious Activity Detected',
      template: 'suspicious-activity',
      context: {
        userName: firstName,
        activityType,
        timestamp,
        supportEmail: this.configService.get<string>(
          'SUPPORT_EMAIL',
          'support@mentalhealth.com',
        ),
        securityUrl: `${this.configService.get<string>('FRONTEND_URL')}/security`,
      },
    });
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
    const { userEmail, counselorEmail, ...data } = appointmentData;

    // Send reminder to user
    await this.sendEmail({
      to: userEmail,
      subject: 'Upcoming Appointment Reminder',
      template: 'appointment-reminder',
      context: {
        ...data,
        recipientType: 'user',
      },
    });

    // Send reminder to counselor
    await this.sendEmail({
      to: counselorEmail,
      subject: 'Upcoming Appointment Reminder',
      template: 'appointment-reminder-counselor',
      context: {
        ...data,
        recipientType: 'counselor',
      },
    });
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
    const { userEmail, counselorEmail, ...data } = appointmentData;

    // Notify user
    await this.sendEmail({
      to: userEmail,
      subject: 'Appointment Confirmed',
      template: 'appointment-confirmed',
      context: {
        ...data,
        recipientType: 'user',
      },
    });

    // Notify counselor
    await this.sendEmail({
      to: counselorEmail,
      subject: 'Appointment Confirmed',
      template: 'appointment-confirmed',
      context: {
        ...data,
        recipientType: 'counselor',
      },
    });
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
    const { userEmail, counselorEmail, cancelledBy, ...data } = appointmentData;

    const recipientEmail = cancelledBy === 'user' ? counselorEmail : userEmail;
    const recipientName =
      cancelledBy === 'user' ? data.counselorName : data.userName;
    const cancellerName =
      cancelledBy === 'user' ? data.userName : data.counselorName;

    await this.sendEmail({
      to: recipientEmail,
      subject: 'Appointment Cancelled',
      template: 'appointment-cancelled',
      context: {
        ...data,
        recipientName,
        cancellerName,
        cancelledBy,
      },
    });
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
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (!adminEmail) {
      this.logger.warn(
        'Admin email not configured, skipping admin notification',
      );
      return;
    }

    await this.sendEmail({
      to: adminEmail,
      subject: `[${notification.severity.toUpperCase()}] System Alert`,
      template: 'admin-notification',
      context: {
        ...notification,
        timestamp: new Date(),
        systemName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
      },
    });
  }

  async sendCrisisAlert(alert: {
    sessionId: string;
    messageId: string;
    crisisType: string;
    confidence: number;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    const crisisTeamEmail = this.configService.get<string>('CRISIS_TEAM_EMAIL');
    if (!crisisTeamEmail) {
      this.logger.error('Crisis team email not configured!');
      throw new Error('Crisis team email not configured');
    }

    await this.sendEmail({
      to: crisisTeamEmail,
      subject: '🚨 URGENT - Crisis Intervention Required',
      template: 'crisis-alert',
      context: {
        ...alert,
        timestamp: new Date(),
        urgencyLevel: 'CRITICAL',
      },
    });
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
        await this.sendEmail({
          to: recipient,
          subject,
          template,
          context: {
            ...context,
            recipientEmail: recipient, // Allow personalization per recipient
          },
        });
        results.sent++;
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
    await this.sendEmail({
      to: email,
      subject: `Newsletter: ${newsletterData.title}`,
      template: 'newsletter',
      context: {
        userName,
        ...newsletterData,
        platformName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
      },
    });
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
    await this.sendEmail({
      to: email,
      subject: promotionData.title,
      template: 'promotional',
      context: {
        userName,
        ...promotionData,
        platformName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
      },
    });
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
    await this.sendEmail({
      to: email,
      subject: "We'd love your feedback",
      template: 'feedback-request',
      context: {
        userName,
        ...feedbackData,
        platformName: this.configService.get<string>(
          'PLATFORM_NAME',
          'Mental Health Platform',
        ),
      },
    });
  }

  // Utility methods
  private getDefaultFromAddress(): string {
    const fromName = this.configService.get<string>(
      'MAIL_FROM_NAME',
      'Mental Health Platform',
    );
    const fromAddress = this.configService.get<string>(
      'MAIL_FROM_ADDRESS',
      'noreply@mentalhealth.com',
    );
    return `${fromName} <${fromAddress}>`;
  }

  // Health check for email service
  async testEmailConnection(): Promise<boolean> {
    try {
      // This would test the SMTP connection
      // Implementation depends on your mailer service
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
