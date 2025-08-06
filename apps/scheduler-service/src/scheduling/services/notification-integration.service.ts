// apps/scheduler-service/src/scheduling/services/notification-integration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NotificationIntegrationService {
  private readonly logger = new Logger(NotificationIntegrationService.name);
  private readonly notificationServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.notificationServiceUrl =
      this.configService.get('NOTIFICATION_SERVICE_URL') ||
      'http://localhost:4003/api/v1';
  }

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
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationServiceUrl}/notifications/appointment/reminder`,
          appointmentData,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getServiceToken()}`,
            },
          },
        ),
      );

      this.logger.log(
        `Appointment reminder sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send appointment reminder:`,
        error.response?.data || error.message,
      );
      // Don't throw error to prevent appointment creation failure
    }
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
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationServiceUrl}/notifications/appointment/confirmed`,
          appointmentData,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getServiceToken()}`,
            },
          },
        ),
      );

      this.logger.log(
        `Appointment confirmation sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send appointment confirmation:`,
        error.response?.data || error.message,
      );
    }
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
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationServiceUrl}/notifications/appointment/cancelled`,
          appointmentData,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getServiceToken()}`,
            },
          },
        ),
      );

      this.logger.log(
        `Appointment cancellation notification sent for appointment ${appointmentData.appointmentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send appointment cancellation:`,
        error.response?.data || error.message,
      );
    }
  }

  private getServiceToken(): string {
    // In a real implementation, you would generate or retrieve a service-to-service JWT token
    // For now, return the regular JWT secret or implement service authentication
    return (
      this.configService.get('SERVICE_JWT_TOKEN') || 'service-token-placeholder'
    );
  }
}
