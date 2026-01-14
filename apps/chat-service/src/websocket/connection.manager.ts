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

  constructor(@InjectRedis() private readonly redis: Redis) {
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
        userId: user?.id || user?.sub,
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
      if (user?.id) {
        if (!this.userConnections.has(user.id)) {
          this.userConnections.set(user.id, new Set());
        }
        this.userConnections.get(user.id)!.add(socket.id);

        // Store in Redis for cross-instance awareness
        await this.redis.sadd(`user_connections:${user.id}`, socket.id);
        await this.redis.expire(`user_connections:${user.id}`, 3600); // 1 hour
      }

      await this.redis.hset(
        `connection:${socket.id}`,
        'userId',
        user?.id || '',
        'connectedAt',
        connectionInfo.connectedAt.toISOString(),
        'isAuthenticated',
        connectionInfo.isAuthenticated.toString(),
      );
      await this.redis.expire(`connection:${socket.id}`, 3600);

      this.logger.debug(
        `Connection added: ${socket.id} (user: ${user?.id || 'anonymous'})`,
      );
    } catch (error) {
      this.logger.error(`Failed to add connection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove a connection
   */
  async removeConnection(socketId: string): Promise<void> {
    try {
      const connection = this.connections.get(socketId);
      if (!connection) {
        return;
      }

      // Remove from all sessions
      for (const sessionId of connection.sessionIds) {
        await this.removeFromSession(socketId, sessionId);
      }

      // Remove from user connections
      if (connection.userId) {
        const userConnections = this.userConnections.get(connection.userId);
        if (userConnections) {
          userConnections.delete(socketId);
          if (userConnections.size === 0) {
            this.userConnections.delete(connection.userId);
          }
        }

        // Remove from Redis
        await this.redis.srem(
          `user_connections:${connection.userId}`,
          socketId,
        );
      }

      // Remove connection info
      this.connections.delete(socketId);
      await this.redis.del(`connection:${socketId}`);

      this.logger.debug(`Connection removed: ${socketId}`);
    } catch (error) {
      this.logger.error(`Failed to remove connection: ${error.message}`);
    }
  }

  /**
   * Add connection to a session
   */
  async addToSession(socketId: string, sessionId: string): Promise<void> {
    try {
      const connection = this.connections.get(socketId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      // Add to connection's session list
      connection.sessionIds.add(sessionId);

      // Get or create session info
      let sessionInfo = this.sessions.get(sessionId);
      if (!sessionInfo) {
        sessionInfo = {
          sessionId,
          connectionIds: new Set(),
          activeUsers: new Map(),
          typingUsers: new Map(),
        };
        this.sessions.set(sessionId, sessionInfo);
      }

      // Add connection to session
      sessionInfo.connectionIds.add(socketId);

      // Update user activity if authenticated
      if (connection.userId) {
        sessionInfo.activeUsers.set(connection.userId, new Date());
      }

      // Store in Redis for cross-instance awareness
      await this.redis.sadd(`session_connections:${sessionId}`, socketId);
      await this.redis.expire(`session_connections:${sessionId}`, 7200); // 2 hours

      if (connection.userId) {
        await this.redis.hset(
          `session_users:${sessionId}`,
          connection.userId,
          new Date().toISOString(),
        );
        await this.redis.expire(`session_users:${sessionId}`, 7200);
      }

      this.logger.debug(`Added ${socketId} to session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to add to session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove connection from a session
   */
  async removeFromSession(socketId: string, sessionId: string): Promise<void> {
    try {
      const connection = this.connections.get(socketId);
      if (connection) {
        connection.sessionIds.delete(sessionId);
      }

      const sessionInfo = this.sessions.get(sessionId);
      if (sessionInfo) {
        sessionInfo.connectionIds.delete(socketId);

        // Remove user activity if authenticated
        if (connection?.userId) {
          sessionInfo.activeUsers.delete(connection.userId);
          sessionInfo.typingUsers.delete(connection.userId);
        }

        // Clean up empty session
        if (sessionInfo.connectionIds.size === 0) {
          this.sessions.delete(sessionId);
          await this.redis.del(`session_connections:${sessionId}`);
          await this.redis.del(`session_users:${sessionId}`);
        }
      }

      // Remove from Redis
      await this.redis.srem(`session_connections:${sessionId}`, socketId);
      if (connection?.userId) {
        await this.redis.hdel(`session_users:${sessionId}`, connection.userId);
      }

      this.logger.debug(`Removed ${socketId} from session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to remove from session: ${error.message}`);
    }
  }

  /**
   * Check if connection is in a session
   */
  async isInSession(socketId: string, sessionId: string): Promise<boolean> {
    const connection = this.connections.get(socketId);
    return connection?.sessionIds.has(sessionId) || false;
  }

  /**
   * Get user ID for a connection
   */
  async getUserId(socketId: string): Promise<string | undefined> {
    const connection = this.connections.get(socketId);
    return connection?.userId;
  }

  /**
   * Update connection activity
   */
  async updateActivity(socketId: string): Promise<void> {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * Update typing status
   */
  async updateTypingStatus(
    socketId: string,
    sessionId: string,
    isTyping: boolean,
  ): Promise<void> {
    try {
      const connection = this.connections.get(socketId);
      if (!connection?.userId) {
        return;
      }

      const sessionInfo = this.sessions.get(sessionId);
      if (!sessionInfo) {
        return;
      }

      if (isTyping) {
        sessionInfo.typingUsers.set(connection.userId, new Date());
      } else {
        sessionInfo.typingUsers.delete(connection.userId);
      }

      // Store in Redis for cross-instance awareness
      const key = `typing:${sessionId}:${connection.userId}`;
      if (isTyping) {
        await this.redis.setex(key, 10, new Date().toISOString()); // 10 seconds TTL
      } else {
        await this.redis.del(key);
      }
    } catch (error) {
      this.logger.error(`Failed to update typing status: ${error.message}`);
    }
  }

  /**
   * Get session connections
   */
  getSessionConnections(sessionId: string): Set<string> {
    const sessionInfo = this.sessions.get(sessionId);
    return sessionInfo?.connectionIds || new Set();
  }

  /**
   * Get active users in session
   */
  getSessionActiveUsers(sessionId: string): Map<string, Date> {
    const sessionInfo = this.sessions.get(sessionId);
    return sessionInfo?.activeUsers || new Map();
  }

  /**
   * Get typing users in session
   */
  getSessionTypingUsers(sessionId: string): Map<string, Date> {
    const sessionInfo = this.sessions.get(sessionId);
    return sessionInfo?.typingUsers || new Map();
  }

  /**
   * Get user's connections
   */
  getUserConnections(userId: string): Set<string> {
    return this.userConnections.get(userId) || new Set();
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    const connections = this.userConnections.get(userId);
    return (connections && connections.size > 0)!;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Get all connections count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get authenticated connections count
   */
  getAuthenticatedConnectionCount(): number {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.isAuthenticated,
    ).length;
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up inactive connections
   */
  private cleanupInactiveConnections(): void {
    const now = new Date();
    const toRemove: string[] = [];

    for (const [socketId, connection] of this.connections) {
      const inactiveTime = now.getTime() - connection.lastActivity.getTime();
      if (inactiveTime > this.CONNECTION_TIMEOUT) {
        toRemove.push(socketId);
      }
    }

    for (const socketId of toRemove) {
      this.removeConnection(socketId);
      this.logger.debug(`Cleaned up inactive connection: ${socketId}`);
    }

    if (toRemove.length > 0) {
      this.logger.log(`Cleaned up ${toRemove.length} inactive connections`);
    }
  }

  /**
   * Clean up typing indicators
   */
  private cleanupTypingIndicators(): void {
    const now = new Date();

    for (const [sessionId, sessionInfo] of this.sessions) {
      const toRemove: string[] = [];

      for (const [userId, typingStartTime] of sessionInfo.typingUsers) {
        const typingTime = now.getTime() - typingStartTime.getTime();
        if (typingTime > this.TYPING_TIMEOUT) {
          toRemove.push(userId);
        }
      }

      for (const userId of toRemove) {
        sessionInfo.typingUsers.delete(userId);
        // Clean up Redis
        this.redis.del(`typing:${sessionId}:${userId}`);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): any {
    const stats = {
      totalConnections: this.connections.size,
      authenticatedConnections: this.getAuthenticatedConnectionCount(),
      activeSessions: this.sessions.size,
      totalUsers: this.userConnections.size,
      connectionsPerSession: {},
      usersPerSession: {},
    };

    // Calculate connections and users per session
    for (const [sessionId, sessionInfo] of this.sessions) {
      stats.connectionsPerSession[sessionId] = sessionInfo.connectionIds.size;
      stats.usersPerSession[sessionId] = sessionInfo.activeUsers.size;
    }

    return stats;
  }
}
