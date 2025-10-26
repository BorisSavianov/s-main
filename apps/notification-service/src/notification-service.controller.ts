// apps/notification-service/src/notification-service.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'apps/auth-service/src/auth/guards/jwt-auth.guard';
import { NotificationServiceClient } from './clients/notification-service.client';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationServiceController {
  constructor(private readonly notificationClient: NotificationServiceClient) {}

  @Post('auth/verification-email')
  @ApiOperation({ summary: 'Send email verification' })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  async sendVerificationEmail(@Body() body: { email: string; token: string }) {
    await this.notificationClient.sendVerificationEmail(body.email, body.token);
    return { message: 'Verification email sent successfully' };
  }

  @Post('auth/password-reset-email')
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  async sendPasswordResetEmail(@Body() body: { email: string; token: string }) {
    await this.notificationClient.sendPasswordResetEmail(
      body.email,
      body.token,
    );
    return { message: 'Password reset email sent successfully' };
  }

  @Post('auth/welcome-email')
  @ApiOperation({ summary: 'Send welcome email' })
  @ApiResponse({ status: 200, description: 'Welcome email sent' })
  async sendWelcomeEmail(@Body() body: { email: string; firstName: string }) {
    await this.notificationClient.sendWelcomeEmail(body.email, body.firstName);
    return { message: 'Welcome email sent successfully' };
  }

  @Post('appointments/reminder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send appointment reminder' })
  @ApiResponse({ status: 200, description: 'Appointment reminder sent' })
  async sendAppointmentReminder(
    @Body()
    appointmentData: {
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
    },
  ) {
    await this.notificationClient.sendAppointmentReminder(appointmentData);
    return { message: 'Appointment reminder sent successfully' };
  }

  @Post('appointments/confirmation')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send appointment confirmation' })
  @ApiResponse({ status: 200, description: 'Appointment confirmation sent' })
  async sendAppointmentConfirmation(
    @Body()
    appointmentData: {
      userEmail: string;
      userName: string;
      counselorEmail: string;
      counselorName: string;
      appointmentId: string;
      appointmentDate: string;
      appointmentTime: string;
      meetingType?: string;
      duration?: number;
    },
  ) {
    await this.notificationClient.sendAppointmentConfirmation(appointmentData);
    return { message: 'Appointment confirmation sent successfully' };
  }

  @Post('appointments/cancellation')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send appointment cancellation' })
  @ApiResponse({ status: 200, description: 'Appointment cancellation sent' })
  async sendAppointmentCancellation(
    @Body()
    appointmentData: {
      userEmail: string;
      userName: string;
      counselorEmail: string;
      counselorName: string;
      appointmentId: string;
      appointmentDate: string;
      appointmentTime: string;
      reason?: string;
      cancelledBy: 'user' | 'counselor';
    },
  ) {
    await this.notificationClient.sendAppointmentCancellation(appointmentData);
    return { message: 'Appointment cancellation sent successfully' };
  }

  @Post('admin/notification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send admin notification' })
  @ApiResponse({ status: 200, description: 'Admin notification sent' })
  async sendAdminNotification(
    @Body()
    notification: {
      type: string;
      messageId?: string;
      sessionId?: string;
      reason: string;
      severity: string;
      additionalData?: Record<string, any>;
    },
  ) {
    await this.notificationClient.sendAdminNotification(notification);
    return { message: 'Admin notification sent successfully' };
  }

  @Post('crisis/alert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send crisis alert' })
  @ApiResponse({ status: 200, description: 'Crisis alert sent' })
  async sendCrisisAlert(
    @Body()
    alert: {
      sessionId: string;
      messageId: string;
      crisisType: string;
      confidence: number;
      additionalData?: Record<string, any>;
    },
  ) {
    await this.notificationClient.sendCrisisAlert(alert);
    return { message: 'Crisis alert sent successfully' };
  }

  @Post('bulk-email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send bulk email' })
  @ApiResponse({ status: 200, description: 'Bulk email sent' })
  async sendBulkEmail(
    @Body()
    data: {
      userEmails: string[];
      subject: string;
      template: string;
      context: Record<string, any>;
    },
  ) {
    const result = await this.notificationClient.sendBulkEmail(data);
    return {
      message: 'Bulk email processing completed',
      sent: result.sent,
      failed: result.failed.length,
      failedEmails: result.failed,
    };
  }
  @Get('health/email')
  @ApiOperation({ summary: 'Check email service health' })
  @ApiResponse({ status: 200, description: 'Email service health status' })
  async checkEmailHealth() {
    return await this.notificationClient.testEmailConnection();
  }

  @Post('templates/:templateName/validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate email template' })
  @ApiResponse({ status: 200, description: 'Template validation result' })
  async validateTemplate(
    @Param('templateName') templateName: string,
    @Body() sampleData: Record<string, any>,
  ) {
    return await this.notificationClient.validateEmailTemplate(
      templateName,
      sampleData,
    );
  }

  @Post('newsletter')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send newsletter email' })
  @ApiResponse({ status: 200, description: 'Newsletter sent' })
  async sendNewsletterEmail(
    @Body()
    data: {
      email: string;
      userName: string;
      newsletterData: {
        title: string;
        content: string;
        unsubscribeUrl: string;
        featuredArticles?: Array<{
          title: string;
          url: string;
          excerpt: string;
        }>;
      };
    },
  ) {
    await this.notificationClient.sendNewsletterEmail(
      data.email,
      data.userName,
      data.newsletterData,
    );
    return { message: 'Newsletter sent successfully' };
  }

  @Post('promotional')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send promotional email' })
  @ApiResponse({ status: 200, description: 'Promotional email sent' })
  async sendPromotionalEmail(
    @Body()
    data: {
      email: string;
      userName: string;
      promotionData: {
        title: string;
        description: string;
        ctaText: string;
        ctaUrl: string;
        expiryDate?: Date;
        unsubscribeUrl: string;
      };
    },
  ) {
    await this.notificationClient.sendPromotionalEmail(
      data.email,
      data.userName,
      data.promotionData,
    );
    return { message: 'Promotional email sent successfully' };
  }

  @Post('feedback-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send feedback request email' })
  @ApiResponse({ status: 200, description: 'Feedback request sent' })
  async sendFeedbackRequestEmail(
    @Body()
    data: {
      email: string;
      userName: string;
      feedbackData: {
        appointmentId?: string;
        counselorName?: string;
        sessionDate?: Date;
        surveyUrl: string;
      };
    },
  ) {
    await this.notificationClient.sendFeedbackRequestEmail(
      data.email,
      data.userName,
      data.feedbackData,
    );
    return { message: 'Feedback request sent successfully' };
  }
}
