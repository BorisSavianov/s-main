// apps/chat-service/src/websocket/websocket.gateway.ts
import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { WebSocketService } from './websocket.service';
import { ConnectionManager } from './connection.manager';
import { WsAuthGuard } from './guards/ws-auth.guard';
import { WsThrottleGuard } from './guards/ws-throttle.guard';
import { SenderType } from '../chat/entities/chat-message.entity';

// DTOs
interface JoinSessionDto {
  sessionId: string;
  userToken?: string;
}

interface SendMessageDto {
  sessionId: string;
  content: string;
  contentType?: string;
}

interface TypingDto {
  sessionId: string;
  isTyping: boolean;
}

interface ClientToServerEvents {
  joinSession: (data: JoinSessionDto) => void;
  leaveSession: (data: { sessionId: string }) => void;
  sendMessage: (data: SendMessageDto) => void;
  typing: (data: TypingDto) => void;
  markAsRead: (data: { sessionId: string; messageIds: string[] }) => void;
  requestAI: (data: { sessionId: string; message: string }) => void;
}

interface ServerToClientEvents {
  sessionJoined: (data: { sessionId: string; success: boolean }) => void;
  sessionLeft: (data: { sessionId: string }) => void;
  newMessage: (data: any) => void;
  messageStatus: (data: {
    messageId: string;
    status: string;
    error?: string;
  }) => void;
  userTyping: (data: {
    sessionId: string;
    userId: string;
    isTyping: boolean;
  }) => void;
  aiTyping: (data: { sessionId: string; isTyping: boolean }) => void;
  messagesRead: (data: {
    sessionId: string;
    messageIds: string[];
    readBy: string;
  }) => void;
  sessionEnded: (data: { sessionId: string; reason: string }) => void;
  error: (data: { code: string; message: string; details?: any }) => void;
  counselorJoined: (data: { sessionId: string; counselorId: string }) => void;
  counselorLeft: (data: { sessionId: string; counselorId: string }) => void;
}

@WSGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:4000',
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server<ClientToServerEvents, ServerToClientEvents>;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(
    private readonly websocketService: WebSocketService,
    private readonly connectionManager: ConnectionManager,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    this.websocketService.setServer(server);
  }

  async handleConnection(client: Socket, ...args: any[]) {
    try {
      const token = this.extractTokenFromHandshake(client);
      const user = token ? await this.validateToken(token) : null;

      await this.connectionManager.addConnection(client, user);

      this.logger.log(
        `Client ${client.id} connected ${user ? `(user: ${user.id})` : '(anonymous)'}`,
      );
    } catch (error) {
      this.logger.error(`Connection failed: ${error.message}`);
      client.emit('error', {
        code: 'CONNECTION_FAILED',
        message: 'Failed to establish connection',
        details: error.message,
      });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      await this.connectionManager.removeConnection(client.id);
      this.logger.log(`Client ${client.id} disconnected`);
    } catch (error) {
      this.logger.error(`Disconnect cleanup failed: ${error.message}`);
    }
  }

  @SubscribeMessage('testEvent')
  async testEvent(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.logger.log(`testEvent received: ${JSON.stringify(data)}`);
    client.emit('testResponse', { received: true });
  }

  @SubscribeMessage('joinSession')
  @UseGuards(WsThrottleGuard)
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinSessionDto,
  ) {
    try {
      const { sessionId, userToken } = data;

      // Validate session access
      const canJoin = await this.websocketService.validateSessionAccess(
        sessionId,
        client,
        userToken,
      );

      if (!canJoin) {
        client.emit('sessionJoined', { sessionId, success: false });
        return;
      }

      // Join the session room
      await client.join(sessionId);
      await this.connectionManager.addToSession(client.id, sessionId);

      // Get session info and recent messages
      const sessionInfo = await this.websocketService.getSessionInfo(sessionId);
      const recentMessages = await this.websocketService.getRecentMessages(
        sessionId,
        20,
      );

      client.emit('sessionJoined', {
        sessionId,
        success: true,
        sessionInfo,
        recentMessages,
      });

      // Notify others in the session
      client.to(sessionId).emit('userJoined', {
        sessionId,
        userId: await this.connectionManager.getUserId(client.id),
      });

      this.logger.debug(`Client ${client.id} joined session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Join session failed: ${error.message}`);
      client.emit('error', {
        code: 'JOIN_SESSION_FAILED',
        message: 'Failed to join session',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('leaveSession')
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    try {
      const { sessionId } = data;

      await client.leave(sessionId);
      await this.connectionManager.removeFromSession(client.id, sessionId);

      client.emit('sessionLeft', { sessionId });

      // Notify others in the session
      client.to(sessionId).emit('userLeft', {
        sessionId,
        userId: await this.connectionManager.getUserId(client.id),
      });

      this.logger.debug(`Client ${client.id} left session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Leave session failed: ${error.message}`);
      client.emit('error', {
        code: 'LEAVE_SESSION_FAILED',
        message: 'Failed to leave session',
      });
    }
  }

  @SubscribeMessage('sendMessage')
  @UseGuards(WsAuthGuard, WsThrottleGuard)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const { sessionId, content, contentType } = data;
      const userId = await this.connectionManager.getUserId(client.id);

      // Validate session membership
      if (!(await this.connectionManager.isInSession(client.id, sessionId))) {
        throw new WsException('Not a member of this session');
      }

      // Create and save message
      const message = await this.websocketService.createMessage({
        sessionId,
        senderId: userId,
        senderType: SenderType.USER,
        content,
        contentType: contentType || 'text',
      });

      // Broadcast to session members
      this.server.to(sessionId).emit('newMessage', {
        ...message,
        isOwn: false, // Will be overridden for sender
      });

      // Send confirmation to sender
      client.emit('messageStatus', {
        messageId: message.id,
        status: 'delivered',
        // tempId: data.tempId,
      });

      // Trigger AI response if needed
      if (await this.websocketService.shouldTriggerAI(sessionId, message)) {
        await this.handleAIResponse(sessionId, content);
      }

      this.logger.debug(`Message sent in session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Send message failed: ${error.message}`);
      client.emit('messageStatus', {
        messageId: null,
        status: 'failed',
        error: error.message,
        // tempId: data.tempId,
      });
    }
  }
  @SubscribeMessage('typing')
  @UseGuards(WsThrottleGuard)
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingDto,
  ) {
    try {
      const { sessionId, isTyping } = data;
      const userId = await this.connectionManager.getUserId(client.id);

      if (!(await this.connectionManager.isInSession(client.id, sessionId))) {
        return;
      }

      // Broadcast typing status to others in session
      client.to(sessionId).emit('userTyping', {
        sessionId,
        userId,
        isTyping,
      });

      // Update typing status in connection manager
      await this.connectionManager.updateTypingStatus(
        client.id,
        sessionId,
        isTyping,
      );
    } catch (error) {
      this.logger.error(`Typing status failed: ${error.message}`);
    }
  }

  @SubscribeMessage('markAsRead')
  @UseGuards(WsAuthGuard)
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; messageIds: string[] },
  ) {
    try {
      const { sessionId, messageIds } = data;
      const userId = await this.connectionManager.getUserId(client.id);

      if (!(await this.connectionManager.isInSession(client.id, sessionId))) {
        throw new WsException('Not a member of this session');
      }

      await this.websocketService.markMessagesAsRead(messageIds, userId!);

      // Notify others in the session
      client.to(sessionId).emit('messagesRead', {
        sessionId,
        messageIds,
        readBy: userId,
      });
    } catch (error) {
      this.logger.error(`Mark as read failed: ${error.message}`);
    }
  }

  @SubscribeMessage('requestAI')
  @UseGuards(WsAuthGuard, WsThrottleGuard)
  async handleRequestAI(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; message: string },
  ) {
    try {
      const { sessionId, message } = data;

      if (!(await this.connectionManager.isInSession(client.id, sessionId))) {
        throw new WsException('Not a member of this session');
      }

      await this.handleAIResponse(sessionId, message);
    } catch (error) {
      this.logger.error(`AI request failed: ${error.message}`);
      client.emit('error', {
        code: 'AI_REQUEST_FAILED',
        message: 'Failed to process AI request',
      });
    }
  }

  // Private methods
  private extractTokenFromHandshake(client: Socket): string | null {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '') ||
      client.handshake.query?.token;

    return typeof token === 'string' ? token : null;
  }

  private async validateToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verify(token);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  private async handleAIResponse(sessionId: string, userMessage: string) {
    try {
      // Show AI typing
      this.server.to(sessionId).emit('aiTyping', { sessionId, isTyping: true });

      // Get AI response
      const aiResponse = await this.websocketService.generateAIResponse(
        sessionId,
        userMessage,
      );

      // Create AI message
      const aiMessage = await this.websocketService.createMessage({
        sessionId,
        senderId: undefined,
        senderType: SenderType.AI,
        content: aiResponse,
        contentType: 'text',
      });

      // Stop AI typing
      this.server
        .to(sessionId)
        .emit('aiTyping', { sessionId, isTyping: false });

      // Broadcast AI message
      this.server.to(sessionId).emit('newMessage', aiMessage);
    } catch (error) {
      this.logger.error(`AI response failed: ${error.message}`);
      this.server
        .to(sessionId)
        .emit('aiTyping', { sessionId, isTyping: false });
      this.server.to(sessionId).emit('error', {
        code: 'AI_RESPONSE_FAILED',
        message: 'AI assistant is temporarily unavailable',
      });
    }
  }

  // Public methods for external use
  async sendMessageToSession(sessionId: string, message: any) {
    this.server.to(sessionId).emit('newMessage', message);
  }

  async endSession(sessionId: string, reason: string) {
    this.server.to(sessionId).emit('sessionEnded', { sessionId, reason });
  }

  async notifyCounselorAction(
    sessionId: string,
    action: string,
    counselorId: string,
  ) {
    const eventName = action === 'join' ? 'counselorJoined' : 'counselorLeft';
    this.server.to(sessionId).emit(eventName, { sessionId, counselorId });
  }
}
