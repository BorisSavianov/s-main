// apps/chat-service/src/websocket/guards/ws-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { ConnectionManager } from '../connection.manager';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly connectionManager: ConnectionManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const data = context.switchToWs().getData();

      // Get connection info
      const connectionInfo = this.connectionManager.getConnectionInfo(
        client.id,
      );

      if (!connectionInfo) {
        throw new WsException('Connection not found');
      }

      // Check if connection is authenticated
      if (!connectionInfo.isAuthenticated) {
        // Try to authenticate using token from message data or handshake
        const token = this.extractToken(client, data);

        if (!token) {
          throw new WsException('Authentication required');
        }

        const user = await this.validateToken(token);
        if (!user) {
          throw new WsException('Invalid authentication token');
        }

        // Update connection with authenticated user info
        connectionInfo.userId = user.id;
        connectionInfo.isAuthenticated = true;
        connectionInfo.metadata = { ...connectionInfo.metadata, ...user };

        this.logger.debug(
          `Authenticated connection ${client.id} for user ${user.id}`,
        );
      }

      // Update last activity
      await this.connectionManager.updateActivity(client.id);

      return true;
    } catch (error) {
      this.logger.error(`WebSocket authentication failed: ${error.message}`);

      if (error instanceof WsException) {
        throw error;
      }

      throw new WsException('Authentication failed');
    }
  }

  private extractToken(client: Socket, data?: any): string | null {
    // Try to get token from multiple sources
    const sources = [
      data?.token,
      data?.userToken,
      client.handshake.auth?.token,
      client.handshake.headers?.authorization?.replace('Bearer ', ''),
      client.handshake.query?.token,
    ];

    for (const token of sources) {
      if (typeof token === 'string' && token.length > 0) {
        return token;
      }
    }

    return null;
  }

  private async validateToken(token: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(token);

      // Basic validation
      if (!payload || !payload.sub) {
        throw new Error('Invalid token payload');
      }

      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions || [],
      };
    } catch (error) {
      this.logger.error(`Token validation failed: ${error.message}`);
      throw new Error('Invalid token');
    }
  }
}
