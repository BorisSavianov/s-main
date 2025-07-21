// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

import { UserService } from '../user.service';
import { SessionService } from '../session.service';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Try to extract from Authorization header first
          let token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

          // If not found, try from cookies
          if (!token && request.cookies) {
            token = request.cookies['access_token'];
          }

          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: JwtPayload) {
    const { sub: userId, email, sessionId } = payload;

    // Verify session is still valid
    const session = await this.sessionService.getSession(sessionId);
    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Get user details
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is still active
    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    // Attach session info to request
    (request as any).sessionId = sessionId;
    (request as any).ipAddress = this.getClientIp(request);
    (request as any).userAgent = request.get('User-Agent') || '';

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      user,
    };
  }

  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      ''
    );
  }
}
