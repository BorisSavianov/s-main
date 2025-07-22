// apps/chat-service/src/websocket/connection.manager.ts
import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';

interface ConnectionInfo {
  socketId: string;
  userId?: string;
  sessionIds: Set<string>;
  connectedAt: Date;
  lastActivity: Date;
  isAuthenticated: boolean;
  metadata: any;
}

interface SessionInfo {
  sessionId: string;
  connectionIds: Set<string>;
  activeUsers: Map<string, Date>; // userId -> lastActivity
  typingUsers: Map<string, Date>; // userId -> typingStartTime
}

@Injectable()
export class ConnectionManager {
  private readonly logger = new Logger(ConnectionManager.name);
  private connections = new Map<string, ConnectionInfo>();
  private sessions = new Map<string, SessionInfo>();
  private userConnections = new Map<string, Set<string>>(); // userId -> socketIds

  private readonly CONNECTION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly TYPING_TIMEOUT = 5 * 1000; // 5 seconds

  constructor(
    @InjectRedis() private readonly redis: Redis,
  ) {
    // Clean up inactive connections every 5 minutes
    setInterval(() => this.cleanupInactiveConnections(), 5 * 60 * 1000);
    
    // Clean up typing indicators every 10 seconds
    setInterval(() => this.cleanupTypingIndicators(), 10 * 1000);
  }

  /**
   * Add a new connection
   */
  async addConnection(socket: Socket, user?: any): Promise<void> {
    try {
      const connectionInfo: ConnectionInfo = {
        socketId: socket.id,
        userId: user?.id,
        sessionIds: new Set(),
        connectedAt: new Date(),
        lastActivity: new Date(),
        isAuthenticated: !!user,
        metadata: {
          userAgent: socket.handshake.headers['user-agent'],
          ip: socket.handshake.address,
          ...user,
        },
      };

      this.connections.set(socket.id, connectionInfo);

      // Track user connections 