// apps/video-service/src/guards/ws-jwt.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      const token = this.extractTokenFromSocket(client);

      if (!token) {
        this.logger.warn('No JWT token provided');
        return false;
      }

      const payload = this.jwtService.verify(token);

      // Attach user info to socket
      (client as any).userId = payload.sub;
      (client as any).user = payload;

      return true;
    } catch (error) {
      this.logger.error(`JWT validation failed: ${error.message}`);
      return false;
    }
  }

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

    // Check extraHeaders
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
}
