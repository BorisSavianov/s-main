// apps/chat-service/src/websocket/guards/ws-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token = this.extractToken(client);

      if (!token) {
        throw new WsException('Authentication token required');
      }

      const payload = await this.validateToken(token);

      // Attach user info to socket for later use
      client.data.user = payload;
      client.data.userId = payload.sub || payload.id;
      client.data.isAuthenticated = true;

      return true;
    } catch (error) {
      this.logger.error(`WebSocket authentication failed: ${error.message}`);
      throw new WsException('Authentication failed');
    }
  }

  private extractToken(client: Socket): string | null {
    // Try multiple sources for the token
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '') ||
      (client.handshake.query?.token as string);

    return token || null;
  }

  private async validateToken(token: string): Promise<any> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      return await this.jwtService.verifyAsync(token, { secret });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new WsException('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new WsException('Invalid token');
      }
      throw new WsException('Token validation failed');
    }
  }
}
