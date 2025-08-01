// src/scheduling/services/meeting-room.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

export interface MeetingRoomDetails {
  roomId: string;
  roomUrl: string;
  roomPassword?: string;
  phoneNumber?: string;
  dialInCode?: string;
}

@Injectable()
export class MeetingRoomService {
  constructor(private configService: ConfigService) {}

  async createVideoRoom(
    meetingId: string,
    meetingType: string,
  ): Promise<MeetingRoomDetails> {
    // This would integrate with your video conferencing provider (Zoom, Teams, etc.)
    const roomId = `room_${meetingId.substring(0, 8)}_${Date.now()}`;
    const baseUrl = this.configService.get<string>(
      'VIDEO_CONFERENCE_BASE_URL',
      'https://meet.example.com',
    );

    const roomDetails: MeetingRoomDetails = {
      roomId,
      roomUrl: `${baseUrl}/room/${roomId}`,
      roomPassword: this.generatePassword(),
      phoneNumber: this.configService.get<string>('DIAL_IN_NUMBER'),
      dialInCode: this.generateDialInCode(),
    };

    // Here you would make API calls to your video conferencing service
    // await this.createRoomWithProvider(roomDetails);

    return roomDetails;
  }

  async deleteVideoRoom(roomId: string): Promise<void> {
    // Delete room from video conferencing provider
    // await this.deleteRoomWithProvider(roomId);
  }

  private generatePassword(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private generateDialInCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
