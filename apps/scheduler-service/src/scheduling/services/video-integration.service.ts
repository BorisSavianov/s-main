// apps/scheduler-service/src/scheduling/services/video-integration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ScheduledMeeting, MeetingType } from '../entities/scheduled-meeting.entity';

interface VideoRoomDetails {
  id: string;
  roomId: string;
  meetingId: string;
  hostUserId: string;
  accessCode: string;
  moderatorCode: string;
  maxParticipants: number;
  roomSettings: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenShareEnabled: boolean;
    chatEnabled: boolean;
    waitingRoomEnabled: boolean;
    muteOnEntry: boolean;
  };
  meetingRoomUrl: string;
  status: string;
}

@Injectable()
export class VideoIntegrationService {
  private readonly logger = new Logger(VideoIntegrationService.name);
  private readonly videoServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.videoServiceUrl =
      this.configService.get('VIDEO_SERVICE_URL') ||
      'http://video-service:4004/api/v1';
  }

  /**
   * Create a video room for a scheduled meeting
   */
  async createRoomForMeeting(meeting: ScheduledMeeting): Promise<VideoRoomDetails> {
    try {
      // Only create rooms for video/audio meetings
      if (
        meeting.meetingType !== MeetingType.VIDEO_CALL &&
        meeting.meetingType !== MeetingType.AUDIO_ONLY
      ) {
        throw new Error('Meeting type does not require a video room');
      }

      const roomSettings = {
        audioEnabled: true,
        videoEnabled: meeting.meetingType === MeetingType.VIDEO_CALL,
        screenShareEnabled: true,
        chatEnabled: true,
        waitingRoomEnabled: false,
        muteOnEntry: false,
      };

      const createRoomDto = {
        meetingId: meeting.id,
        maxParticipants: 2, // Default for counselor + client
        isRecordingEnabled: false,
        roomSettings,
      };

      this.logger.log(`Creating video room for meeting ${meeting.id}`);
        
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.videoServiceUrl}/video/rooms`,
          createRoomDto,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Service': 'scheduler-service',
              'X-User-ID': meeting.counselorId,
            },
            timeout: 10000,
          },
        ),
      );

      const roomData = response.data?.data ?? response.data;

      if (!roomData?.roomId) {
        throw new Error(
          `Video service response missing roomId for meeting ${meeting.id}`,
        );
      }

      this.logger.log(
        `Video room created successfully: ${roomData.roomId} for meeting ${meeting.id}`,
      );

      return {
        id: roomData.id,
        roomId: roomData.roomId,
        meetingId: meeting.id,
        hostUserId: meeting.counselorId,
        accessCode: roomData.accessCode,
        moderatorCode: roomData.moderatorCode,
        maxParticipants: roomData.maxParticipants,
        roomSettings: roomData.roomSettings,
        meetingRoomUrl: `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/video/${roomData.roomId}?meetingId=${meeting.id}&accessCode=${roomData.accessCode}`,
        status: roomData.status,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create video room for meeting ${meeting.id}:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Get room details for a meeting
   */
  async getRoomForMeeting(meetingId: string): Promise<VideoRoomDetails | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.videoServiceUrl}/video/meetings/${meetingId}/room`,
          {
            headers: {
              'X-Service': 'scheduler-service',
            },
            timeout: 5000,
          },
        ),
      );

      return response.data?.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      this.logger.error(
        `Failed to get room for meeting ${meetingId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * End a video room
   */
  async endRoom(roomId: string, userId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(`${this.videoServiceUrl}/video/rooms/${roomId}/end`, {
          headers: {
            'X-Service': 'scheduler-service',
            'X-User-ID': userId,
          },
          timeout: 5000,
        }),
      );

      this.logger.log(`Video room ${roomId} ended successfully`);
    } catch (error) {
      this.logger.error(`Failed to end room ${roomId}:`, error.message);
      // Don't throw - room ending is not critical for meeting completion
    }
  }

  /**
   * Update room settings
   */
  async updateRoomSettings(
    roomId: string,
    settings: Partial<{
      maxParticipants: number;
      isRecordingEnabled: boolean;
      roomSettings: any;
    }>,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.put(
          `${this.videoServiceUrl}/video/rooms/${roomId}`,
          settings,
          {
            headers: {
              'X-Service': 'scheduler-service',
            },
            timeout: 5000,
          },
        ),
      );

      this.logger.log(`Room ${roomId} settings updated`);
    } catch (error) {
      this.logger.error(
        `Failed to update room ${roomId} settings:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Check if room is active
   */
  async isRoomActive(roomId: string, userId?: string): Promise<boolean> {
    try {
      const headers: any = {
        'X-Service': 'scheduler-service',
      };
      
      if (userId) {
        headers['X-User-ID'] = userId;
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.videoServiceUrl}/video/rooms/${roomId}`, {
          headers,
          timeout: 5000,
        }),
      );

      return response.data?.data?.status === 'active';
    } catch (error) {
      this.logger.error(
        `Failed to check room ${roomId} status:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Get room participants count
   */
  async getRoomParticipantsCount(roomId: string, userId?: string): Promise<number> {
    try {
      const headers: any = {
        'X-Service': 'scheduler-service',
      };
      
      if (userId) {
        headers['X-User-ID'] = userId;
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.videoServiceUrl}/video/rooms/${roomId}/stats`,
          {
            headers,
            timeout: 5000,
          },
        ),
      );

      return response.data?.data?.participantCount || 0;
    } catch (error) {
      this.logger.error(
        `Failed to get participants for room ${roomId}:`,
        error.message,
      );
      return 0;
    }
  }

  /**
   * Validate room access for a user
   */
  async validateRoomAccess(
    roomId: string,
    userId: string,
    accessCode?: string,
  ): Promise<boolean> {
    try {
      const params = accessCode ? { accessCode } : {};
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.videoServiceUrl}/video/rooms/${roomId}/validate`,
          {
            params,
            headers: {
              'X-Service': 'scheduler-service',
              'X-User-ID': userId,
            },
            timeout: 5000,
          },
        ),
      );

      this.logger.debug(`Room ${roomId} access validated successfully: ${JSON.stringify(response.data)}`);

      return response.data.valid === true;
    } catch (error) {
      this.logger.error(
        `Failed to validate room access for ${roomId}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Generate meeting room URL with access code
   */
  generateMeetingUrl(roomId: string, meetingId: string, accessCode: string): string {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    return `${frontendUrl}/video/${roomId}?meetingId=${meetingId}&accessCode=${accessCode}`;
  }

  /**
   * Get service health status
   */
  async checkVideoServiceHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.videoServiceUrl}/health`, {
          timeout: 3000,
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.error('Video service health check failed:', error.message);
      return false;
    }
  }
}
