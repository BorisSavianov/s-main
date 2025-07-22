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

// DTOs
interface JoinSessionDto {
  sessionId: string;
  userToken?: string;
}

interface SendMessageDto {
  sessionId: string;
  content: string;
  contentType?: string;
  replyToId?: string;
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
  messageStatus