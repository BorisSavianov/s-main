// apps/user-service/src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

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
  constructor(private readonly configService: ConfigService) {
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
    const { sub: userId, email, role, sessionId } = payload;

    // Basic validation - more detailed validation would be done by auth-service
    if (!userId || !email || !role) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Attach session info to request
    (request as any).sessionId = sessionId;
    (request as any).ipAddress = this.getClientIp(request);
    (request as any).userAgent = request.get('User-Agent') || '';

    return {
      userId,
      email,
      role,
      sessionId,
      sub: userId, // Alias for compatibility
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
