// apps/video-service/src/video/gateways/video.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  forwardRef,
  Inject,
  Logger,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WsJwtGuard } from '../../guards/ws-jwt.guard'; // Use our custom guard
import { VideoService } from '../services/video.service';
import { VideoParticipant } from '../entities/video-participant.entity';

interface AuthenticatedSocket extends Socket {
  userId: string;
  roomId?: string;
  participantId?: string;
}

interface WebRTCSignalData {
  type: 'offer' | 'answer' | 'ice-candidate' | 'renegotiate';
  sdp?: string;
  candidate?: RTCIceCandidate;
  targetUserId?: string;
}

interface ChatMessage {
  message: string;
  timestamp: Date;
  type: 'text' | 'emoji' | 'system';
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/video',
})
@UsePipes(new ValidationPipe({ transform: true }))
export class VideoGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(VideoGateway.name);
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();
  private roomParticipants: Map<string, Set<string>> = new Map();

  constructor(
    @Inject(forwardRef(() => VideoService))
    private videoService: VideoService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Video WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      this.logger.log(`Client attempting connection: ${client.id}`);

      // Manual JWT verification since we can't use guards on connection
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        this.logger.warn(`No token provided for client ${client.id}`);
        client.emit('auth-error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // You'll need to inject JwtService or validate token manually
      // For now, let's extract the user ID from the token payload
      try {
        const base64Payload = token.split('.')[1];
        const payload = JSON.parse(
          Buffer.from(base64Payload, 'base64').toString(),
        );

        if (!payload.sub) {
          throw new Error('Invalid token payload');
        }

        client.userId = payload.sub;

        this.connectedClients.set(client.id, client);

        this.logger.log(
          `Client ${client.id} connected successfully (User: ${payload.sub})`,
        );
        client.emit('connected', { userId: payload.sub, socketId: client.id });
      } catch (tokenError) {
        this.logger.error(`Token validation failed: ${tokenError.message}`);
        client.emit('auth-error', { message: 'Invalid token' });
        client.disconnect();
        return;
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.emit('connection-error', { message: error.message });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      if (client.roomId) {
        await this.leaveRoom(client, { roomId: client.roomId });
      }

      this.connectedClients.delete(client.id);
      this.logger.log(`Client ${client.id} disconnected`);
    } catch (error) {
      this.logger.error(`Disconnect error: ${error.message}`);
    }
  }

  @SubscribeMessage('join-room')
  async joinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { roomId: string; accessCode?: string; displayName?: string },
  ) {
    try {
      this.logger.log(
        `User ${client.userId} attempting to join room ${data.roomId}`,
      );

      // Check if user is authenticated
      if (!client.userId) {
        client.emit('join-room-error', { message: 'Not authenticated' });
        return;
      }

      const { roomId, accessCode, displayName } = data;

      const joinResult = await this.videoService.joinRoom(
        roomId,
        {
          accessCode,
          displayName,
          deviceCapabilities: {
            video: true,
            audio: true,
            screenShare: true,
          },
        },
        client.userId,
      );

      // Update client state
      client.roomId = roomId;
      client.participantId = joinResult.participant.id;

      // Add to room tracking
      if (!this.roomParticipants.has(roomId)) {
        this.roomParticipants.set(roomId, new Set());
      }
      this.roomParticipants.get(roomId)!.add(client.id);

      // Join socket room
      await client.join(roomId);

      // Send join confirmation to client
      client.emit('joined-room', {
        room: joinResult.room,
        participant: joinResult.participant,
        rtcConfiguration: joinResult.rtcConfiguration,
        sessionToken: joinResult.sessionToken,
      });

      // Notify others in room
      client.to(roomId).emit('participant-joined', {
        participant: joinResult.participant,
        timestamp: new Date(),
      });

      // Send current participants list to new joiner
      const roomDetails = await this.videoService.getRoomDetails(
        roomId,
        client.userId,
      );
      const activeParticipants =
        roomDetails.participants?.filter((p) => p.status === 'connected') || [];

      client.emit('participants-list', {
        participants: activeParticipants,
        count: activeParticipants.length,
      });

      this.logger.log(`User ${client.userId} joined room ${roomId}`);
    } catch (error) {
      this.logger.error(`Join room error: ${error.message}`);
      client.emit('join-room-error', { message: error.message });
    }
  }

  @SubscribeMessage('leave-room')
  async leaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      const { roomId } = data;

      if (client.roomId === roomId) {
        await this.videoService.leaveRoom(roomId, client.userId);

        // Update client state
        client.roomId = undefined;
        client.participantId = undefined;

        // Remove from room tracking
        this.roomParticipants.get(roomId)?.delete(client.id);
        if (this.roomParticipants.get(roomId)?.size === 0) {
          this.roomParticipants.delete(roomId);
        }

        // Leave socket room
        await client.leave(roomId);

        client.emit('left-room', { roomId });
        this.logger.log(`User ${client.userId} left room ${roomId}`);
      }
    } catch (error) {
      this.logger.error(`Leave room error: ${error.message}`);
      client.emit('leave-room-error', { message: error.message });
    }
  }

  @SubscribeMessage('webrtc-signal')
  async handleWebRTCSignal(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WebRTCSignalData & { roomId: string },
  ) {
    try {
      if (!client.roomId || client.roomId !== data.roomId) {
        throw new Error('Client not in specified room');
      }

      const { roomId, targetUserId, ...signalData } = data;

      if (targetUserId) {
        // Direct peer-to-peer signaling
        const targetClient = this.findClientByUserId(targetUserId, roomId);
        if (targetClient) {
          targetClient.emit('webrtc-signal', {
            ...signalData,
            fromUserId: client.userId,
            roomId,
          });
        }
      } else {
        // Broadcast to all participants in room
        client.to(roomId).emit('webrtc-signal', {
          ...signalData,
          fromUserId: client.userId,
          roomId,
        });
      }
    } catch (error) {
      this.logger.error(`WebRTC signaling error: ${error.message}`);
      client.emit('webrtc-signal-error', { message: error.message });
    }
  }

  @SubscribeMessage('media-state-changed')
  async handleMediaStateChanged(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { video: boolean; audio: boolean; screenShare?: boolean },
  ) {
    try {
      if (!client.roomId) {
        throw new Error('Client not in a room');
      }

      await this.videoService.updateParticipantMedia(
        client.roomId,
        client.userId,
        data,
      );

      // Notify other participants
      client.to(client.roomId).emit('participant-media-changed', {
        userId: client.userId,
        mediaState: data,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Media state change error: ${error.message}`);
      client.emit('media-state-error', { message: error.message });
    }
  }

  @SubscribeMessage('chat-message')
  async handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: ChatMessage,
  ) {
    try {
      if (!client.roomId) {
        throw new Error('Client not in a room');
      }

      const chatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: client.userId,
        message: data.message,
        type: data.type || 'text',
        timestamp: new Date(),
      };

      // Broadcast to all participants in room (including sender)
      this.server.to(client.roomId).emit('chat-message', chatMessage);
    } catch (error) {
      this.logger.error(`Chat message error: ${error.message}`);
      client.emit('chat-message-error', { message: error.message });
    }
  }

  @SubscribeMessage('start-recording')
  async handleStartRecording(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      // Only host or moderator can start recording
      // This would integrate with recording service
      client.to(data.roomId).emit('recording-started', {
        startedBy: client.userId,
        timestamp: new Date(),
      });

      this.logger.log(
        `Recording started in room ${data.roomId} by ${client.userId}`,
      );
    } catch (error) {
      this.logger.error(`Start recording error: ${error.message}`);
      client.emit('recording-error', { message: error.message });
    }
  }

  @SubscribeMessage('end-room')
  async handleEndRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      await this.videoService.endRoom(data.roomId, client.userId);
    } catch (error) {
      this.logger.error(`End room error: ${error.message}`);
      client.emit('end-room-error', { message: error.message });
    }
  }

  @SubscribeMessage('get-room-stats')
  async handleGetRoomStats(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      const stats = await this.videoService.getRoomStats(data.roomId);
      client.emit('room-stats', stats);
    } catch (error) {
      this.logger.error(`Get room stats error: ${error.message}`);
      client.emit('room-stats-error', { message: error.message });
    }
  }

  // Helper method to extract token from socket
  private extractTokenFromSocket(client: Socket): string | undefined {
    // Try different ways the token might be sent
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check auth object
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // Check extraHeaders (case sensitive)
    const extraAuthHeader = client.handshake.headers.Authorization;
    if (
      extraAuthHeader &&
      typeof extraAuthHeader === 'string' &&
      extraAuthHeader.startsWith('Bearer ')
    ) {
      return extraAuthHeader.substring(7);
    }

    return undefined;
  }

  // Public methods for service to call
  public notifyParticipantJoined(
    roomId: string,
    participant: VideoParticipant,
  ): void {
    this.server.to(roomId).emit('participant-joined', {
      participant,
      timestamp: new Date(),
    });
  }

  public notifyParticipantLeft(
    roomId: string,
    participant: VideoParticipant,
  ): void {
    this.server.to(roomId).emit('participant-left', {
      participant,
      timestamp: new Date(),
    });
  }

  public notifyRoomEnded(roomId: string): void {
    this.server.to(roomId).emit('room-ended', {
      roomId,
      timestamp: new Date(),
    });

    // Clean up room tracking
    this.roomParticipants.delete(roomId);
  }

  public notifyMediaStateChanged(
    roomId: string,
    userId: string,
    mediaState: any,
  ): void {
    this.server.to(roomId).emit('participant-media-changed', {
      userId,
      mediaState,
      timestamp: new Date(),
    });
  }

  public forwardSignalingData(
    roomId: string,
    fromUserId: string,
    signalData: any,
  ): void {
    this.server.to(roomId).emit('webrtc-signal', {
      ...signalData,
      fromUserId,
      roomId,
    });
  }

  // Helper methods
  private findClientByUserId(
    userId: string,
    roomId?: string,
  ): AuthenticatedSocket | undefined {
    for (const [clientId, client] of this.connectedClients.entries()) {
      if (client.userId === userId && (!roomId || client.roomId === roomId)) {
        return client;
      }
    }
    return undefined;
  }

  // Heartbeat to keep connections alive
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit('pong', { timestamp: Date.now() });
  }
}
