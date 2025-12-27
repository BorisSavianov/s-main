// apps/video-service/src/video/services/scheduling-integration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { log } from 'console';

interface Meeting {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  counselorId: string;
  clientId: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  videoRoomId?: string;
  videoRoomUrl?: string;
  accessCode?: string;
}

@Injectable()
export class SchedulingIntegrationService {
  private readonly logger = new Logger(SchedulingIntegrationService.name);
  private readonly schedulingServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.schedulingServiceUrl = this.configService.get<string>(
      'SCHEDULING_SERVICE_URL',
      'http://scheduler-service:4003/api/v1/scheduling',
    );
  }

  async validateMeetingAccess(
    meetingId: string,
    userId: string,
  ): Promise<Meeting | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.schedulingServiceUrl}/meetings/${meetingId}`,
          {
            headers: {
              'X-User-ID': userId, // For service-to-service auth
              'X-Service': 'video-service',
            },
            timeout: 5000,
          },
        ),
      );

      const meeting = response.data.data;
      
      this.logger.debug(`Meeting counselorId: ${meeting.counselor?.id}`);
      this.logger.debug(`Meeting clientId: ${meeting.user?.id}`);
      this.logger.debug(`User id: ${userId}`);
      
      // Check if user has access to this meeting
      const hasAccess =
        meeting.counselor?.id === userId || meeting.user?.id === userId;

      if (!hasAccess) {
        this.logger.warn(
          `User ${userId} attempted to access meeting ${meetingId} without permission: ${JSON.stringify(meeting)}`,
        );
        return null;
      }

      return meeting;
    } catch (error) {
      this.logger.error(`Failed to validate meeting access: ${error.message}`);
      return null;
    }
  }

  async updateMeetingWithRoomDetails(
    meetingId: string,
    roomId: string,
    roomUrl: string,
    accessCode: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.put(
          `${this.schedulingServiceUrl}/meetings/${meetingId}/video-room`,
          {
            videoRoomId: roomId,
            videoRoomUrl: roomUrl,
            accessCode: accessCode,
          },
          {
            headers: {
              'X-Service': 'video-service',
            },
            timeout: 5000,
          },
        ),
      );

      this.logger.log(`Updated meeting ${meetingId} with room details`);
    } catch (error) {
      this.logger.error(
        `Failed to update meeting with room details: ${error.message}`,
      );
      // Don't throw - this is not critical for video functionality
    }
  }

  async updateMeetingStatus(
    meetingId: string,
    status: 'in_progress' | 'completed' | 'cancelled',
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.put(
          `${this.schedulingServiceUrl}/meetings/${meetingId}/status`,
          { status },
          {
            headers: {
              'X-Service': 'video-service',
            },
            timeout: 5000,
          },
        ),
      );

      this.logger.log(`Updated meeting ${meetingId} status to ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update meeting status: ${error.message}`);
      // Don't throw - this is not critical for video functionality
    }
  }

  async getMeetingParticipants(meetingId: string): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.schedulingServiceUrl}/meetings/${meetingId}/participants`,
          {
            headers: {
              'X-Service': 'video-service',
            },
            timeout: 5000,
          },
        ),
      );

      return response.data.data.participants || [];
    } catch (error) {
      this.logger.error(`Failed to get meeting participants: ${error.message}`);
      return [];
    }
  }

  async notifyMeetingStarted(meetingId: string, roomId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.schedulingServiceUrl}/meetings/${meetingId}/notifications/started`,
          {
            roomId,
            timestamp: new Date(),
          },
          {
            headers: {
              'X-Service': 'video-service',
            },
            timeout: 5000,
          },
        ),
      );
    } catch (error) {
      this.logger.error(`Failed to notify meeting started: ${error.message}`);
    }
  }

  async notifyMeetingEnded(
    meetingId: string,
    roomId: string,
    duration: number,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.schedulingServiceUrl}/meetings/${meetingId}/notifications/ended`,
          {
            roomId,
            duration,
            endedAt: new Date(),
          },
          {
            headers: {
              'X-Service': 'video-service',
            },
            timeout: 5000,
          },
        ),
      );
    } catch (error) {
      this.logger.error(`Failed to notify meeting ended: ${error.message}`);
    }
  }

  // Integration with user service for participant details
  async getUserDetails(userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  } | null> {
    try {
      const userServiceUrl = this.configService.get<string>(
        'USER_SERVICE_URL',
        'http://localhost:4001',
      );

      const response = await firstValueFrom(
        this.httpService.get(`${userServiceUrl}/users/${userId}`, {
          headers: {
            'X-Service': 'video-service',
          },
          timeout: 5000,
        }),
      );

      return response.data?.data;
    } catch (error) {
      this.logger.error(`Failed to get user details: ${error.message}`);
      return null;
    }
  }

  // Emergency meeting creation for video-first sessions
  async createEmergencyMeeting(
    counselorId: string,
    clientId: string,
    duration: number = 60 * 60 * 1000, // 1 hour in milliseconds
  ): Promise<Meeting | null> {
    try {
      const now = new Date();
      const endTime = new Date(now.getTime() + duration);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.schedulingServiceUrl}/meetings/emergency`,
          {
            title: 'Emergency Video Session',
            startTime: now,
            endTime: endTime,
            counselorId,
            clientId,
            type: 'emergency',
            status: 'in_progress',
          },
          {
            headers: {
              'X-Service': 'video-service',
              'X-User-ID': counselorId,
            },
            timeout: 5000,
          },
        ),
      );

      return response.data?.data;
    } catch (error) {
      this.logger.error(`Failed to create emergency meeting: ${error.message}`);
      return null;
    }
  }
}
