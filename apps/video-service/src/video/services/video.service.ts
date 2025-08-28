// apps/video-service/src/video/services/video.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { VideoRoom } from '../entities/video-room.entity';
import { VideoParticipant } from '../entities/video-participant.entity';
import { VideoSession } from '../entities/video-session.entity';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { JoinRoomDto } from '../dtos/join-room.dto';
import { VideoGateway } from '../gateways/video.gateway';
import { SchedulingIntegrationService } from './scheduling-integration.service';

export interface RTCConfiguration {
  iceServers: RTCIceServer[];
}

export interface RoomStats {
  participantCount: number;
  sessionDuration: number;
  bandwidth: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly rtcConfig: RTCConfiguration;

  constructor(
    @InjectRepository(VideoRoom)
    private roomRepository: Repository<VideoRoom>,
    @InjectRepository(VideoParticipant)
    private participantRepository: Repository<VideoParticipant>,
    @InjectRepository(VideoSession)
    private sessionRepository: Repository<VideoSession>,
    private configService: ConfigService,
    private videoGateway: VideoGateway,
    private schedulingIntegration: SchedulingIntegrationService,
  ) {
    // Configure WebRTC with Google's public STUN/TURN servers
    this.rtcConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302',
          ],
        },
        // Add custom TURN server if configured
        ...(this.configService.get('TURN_SERVER_URL')
          ? [
              {
                urls: this.configService.get('TURN_SERVER_URL'),
                username: this.configService.get('TURN_SERVER_USERNAME'),
                credential: this.configService.get('TURN_SERVER_PASSWORD'),
              },
            ]
          : []),
      ],
    };
  }

  async createRoom(
    createRoomDto: CreateRoomDto,
    hostUserId: string,
  ): Promise<VideoRoom> {
    const { meetingId, maxParticipants, isRecordingEnabled, roomSettings } =
      createRoomDto;

    // Validate meeting exists and user has permission
    if (meetingId) {
      const meeting = await this.schedulingIntegration.validateMeetingAccess(
        meetingId,
        hostUserId,
      );
      if (!meeting) {
        throw new BadRequestException('Meeting not found or access denied');
      }
    }

    // Generate room ID and access codes
    const roomId = this.generateRoomId();
    const accessCode = this.generateAccessCode();
    const moderatorCode = this.generateAccessCode();

    const room = this.roomRepository.create({
      roomId,
      meetingId,
      hostUserId,
      accessCode,
      moderatorCode,
      maxParticipants: maxParticipants || 2,
      isRecordingEnabled: isRecordingEnabled || false,
      roomSettings: {
        audioEnabled: true,
        videoEnabled: true,
        screenShareEnabled: true,
        chatEnabled: true,
        waitingRoomEnabled: false,
        muteOnEntry: false,
        ...roomSettings,
      },
      rtcConfiguration: this.rtcConfig,
      status: 'waiting',
    });

    const savedRoom = await this.roomRepository.save(room);

    // Update meeting with room details if linked to a meeting
    if (meetingId) {
      await this.schedulingIntegration.updateMeetingWithRoomDetails(
        meetingId,
        roomId,
        `${this.configService.get('VIDEO_SERVICE_URL', 'http://localhost:4005')}/room/${roomId}`,
        accessCode,
      );
    }

    this.logger.log(
      `Created video room ${roomId} for meeting ${meetingId || 'standalone'}`,
    );
    return savedRoom;
  }

  async joinRoom(
    roomId: string,
    joinRoomDto: JoinRoomDto,
    userId: string,
  ): Promise<{
    room: VideoRoom;
    participant: VideoParticipant;
    rtcConfiguration: RTCConfiguration;
    sessionToken: string;
  }> {
    const { displayName, accessCode, deviceCapabilities } = joinRoomDto;

    // Find and validate room
    const room = await this.roomRepository.findOne({
      where: { roomId },
      relations: ['participants', 'meeting'],
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status === 'ended') {
      throw new BadRequestException('Room has ended');
    }

    // Validate access
    const isModerator = accessCode === room.moderatorCode;
    const hasAccess =
      isModerator ||
      accessCode === room.accessCode ||
      room.hostUserId === userId ||
      (room.meetingId &&
        (await this.schedulingIntegration.validateMeetingAccess(
          room.meetingId,
          userId,
        )));

    if (!hasAccess) {
      throw new BadRequestException('Invalid access code or permission denied');
    }

    // Check room capacity
    const activeParticipants =
      room.participants?.filter((p) => p.status === 'connected').length || 0;
    if (activeParticipants >= room.maxParticipants && !isModerator) {
      throw new BadRequestException('Room is full');
    }

    // Create or update participant
    let participant = await this.participantRepository.findOne({
      where: { roomId, userId },
    });

    if (participant) {
      // Rejoin existing participant
      participant.status = 'connecting';
      participant.displayName = displayName || participant.displayName;
      participant.deviceCapabilities = {
        ...participant.deviceCapabilities,
        ...deviceCapabilities,
      };
      participant.lastSeen = new Date();
    } else {
      // Create new participant
      participant = this.participantRepository.create({
        roomId,
        userId,
        displayName: displayName || 'Anonymous',
        role: isModerator ? 'moderator' : 'participant',
        deviceCapabilities: {
          video: true,
          audio: true,
          screenShare: false,
          ...deviceCapabilities,
        },
        status: 'connecting',
      });
    }

    participant = await this.participantRepository.save(participant);

    // Update room status if first participant
    if (room.status === 'waiting') {
      room.status = 'active';
      room.startedAt = new Date();
      await this.roomRepository.save(room);

      // Mark meeting as in progress if linked
      if (room.meetingId) {
        await this.schedulingIntegration.updateMeetingStatus(
          room.meetingId,
          'in_progress',
        );
      }
    }

    // Generate session token for this participant
    const sessionToken = this.generateSessionToken(roomId, userId);

    // Notify other participants about new joiner
    this.videoGateway.notifyParticipantJoined(roomId, participant);

    this.logger.log(`User ${userId} (${displayName}) joined room ${roomId}`);

    return {
      room,
      participant,
      rtcConfiguration: this.rtcConfig,
      sessionToken,
    };
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const participant = await this.participantRepository.findOne({
      where: { roomId, userId },
    });

    if (!participant) {
      return; // Already not in room
    }

    // Update participant status
    participant.status = 'disconnected';
    participant.leftAt = new Date();
    await this.participantRepository.save(participant);

    // Check if room should be ended
    const room = await this.roomRepository.findOne({
      where: { roomId },
      relations: ['participants'],
    });

    if (room) {
      const activeParticipants =
        room.participants?.filter((p) => p.status === 'connected').length || 0;

      // End room if no active participants or if host left
      if (activeParticipants === 0 || userId === room.hostUserId) {
        await this.endRoom(roomId, userId);
      } else {
        // Notify other participants about departure
        this.videoGateway.notifyParticipantLeft(roomId, participant);
      }
    }

    this.logger.log(`User ${userId} left room ${roomId}`);
  }

  async endRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.roomRepository.findOne({
      where: { roomId },
      relations: ['participants', 'sessions'],
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Only host or moderator can end room
    const participant = room.participants?.find((p) => p.userId === userId);
    if (room.hostUserId !== userId && participant?.role !== 'moderator') {
      throw new BadRequestException('Only host or moderator can end the room');
    }

    // Update room status
    room.status = 'ended';
    room.endedAt = new Date();
    await this.roomRepository.save(room);

    // Disconnect all participants
    if (room.participants) {
      for (const participant of room.participants.filter(
        (p) => p.status === 'connected',
      )) {
        participant.status = 'disconnected';
        participant.leftAt = new Date();
        await this.participantRepository.save(participant);
      }
    }

    // Create session summary
    if (room.sessions && room.sessions.length > 0) {
      const totalDuration = room.endedAt.getTime() - room.startedAt.getTime();
      const sessionSummary = {
        totalDuration,
        participantCount: room.participants?.length || 0,
        maxConcurrentParticipants: Math.max(
          ...(room.participants?.map((p) => 1) || [0]),
        ),
      };

      // Update the main session record
      const mainSession = room.sessions[0];
      mainSession.endedAt = new Date();
      mainSession.sessionData = {
        ...mainSession.sessionData,
        summary: sessionSummary,
      };
      await this.sessionRepository.save(mainSession);
    }

    // Mark meeting as completed if linked
    if (room.meetingId) {
      await this.schedulingIntegration.updateMeetingStatus(
        room.meetingId,
        'completed',
      );
    }

    // Notify all participants that room has ended
    this.videoGateway.notifyRoomEnded(roomId);

    this.logger.log(`Room ${roomId} ended by user ${userId}`);
  }

  async getRoomDetails(roomId: string, userId: string): Promise<VideoRoom> {
    const room = await this.roomRepository.findOne({
      where: { roomId },
      relations: ['participants', 'meeting'],
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user has access to view room details
    const hasAccess =
      room.hostUserId === userId ||
      room.participants?.some((p) => p.userId === userId) ||
      (room.meetingId &&
        (await this.schedulingIntegration.validateMeetingAccess(
          room.meetingId,
          userId,
        )));

    if (!hasAccess) {
      throw new BadRequestException('Access denied');
    }

    return room;
  }

  async getRoomStats(roomId: string): Promise<RoomStats> {
    const room = await this.roomRepository.findOne({
      where: { roomId },
      relations: ['participants'],
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const activeParticipants =
      room.participants?.filter((p) => p.status === 'connected').length || 0;
    const sessionDuration = room.startedAt
      ? Date.now() - room.startedAt.getTime()
      : 0;

    return {
      participantCount: activeParticipants,
      sessionDuration,
      bandwidth: 0, // Would be calculated from WebRTC stats
      connectionQuality: activeParticipants > 0 ? 'good' : 'disconnected',
    };
  }

  async handleWebRTCSignaling(
    roomId: string,
    userId: string,
    signalData: any,
  ): Promise<void> {
    // Validate participant is in room
    const participant = await this.participantRepository.findOne({
      where: { roomId, userId },
    });

    if (!participant || participant.status !== 'connected') {
      throw new BadRequestException('Participant not connected to room');
    }

    // Forward signaling data through WebSocket gateway
    this.videoGateway.forwardSignalingData(roomId, userId, signalData);
  }

  async updateParticipantMedia(
    roomId: string,
    userId: string,
    mediaState: { video: boolean; audio: boolean; screenShare?: boolean },
  ): Promise<void> {
    const participant = await this.participantRepository.findOne({
      where: { roomId, userId },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    // Update participant's media state
    participant.mediaState = { ...participant.mediaState, ...mediaState };
    await this.participantRepository.save(participant);

    // Notify other participants about media state change
    this.videoGateway.notifyMediaStateChanged(roomId, userId, mediaState);
  }

  // Private helper methods
  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAccessCode(): string {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  private generateSessionToken(roomId: string, userId: string): string {
    const payload = {
      roomId,
      userId,
      timestamp: Date.now(),
    };

    // In production, use JWT with proper signing
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  // Scheduled cleanup of inactive rooms
  async cleanupInactiveRooms(): Promise<void> {
    const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

    const inactiveRooms = await this.roomRepository
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.participants', 'participants')
      .where('room.status = :status', { status: 'active' })
      .andWhere('room.startedAt < :cutoffTime', { cutoffTime })
      .andWhere(
        'participants.lastSeen < :cutoffTime OR participants.lastSeen IS NULL',
      )
      .getMany();

    for (const room of inactiveRooms) {
      await this.endRoom(room.roomId, room.hostUserId);
      this.logger.log(`Cleaned up inactive room ${room.roomId}`);
    }
  }
}
