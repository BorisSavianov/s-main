// src/auth/strategies/refresh-token.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

import { UserService } from '../user.service';
import { RedisService } from '../../redis/redis.service';

export interface RefreshTokenPayload {
  sub: string; // user ID
  email: string;
  tokenId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Try to extract from cookies first
          let token = request.cookies?.['refresh_token'];

          // If not found, try from body
          if (!token && request.body?.refreshToken) {
            token = request.body.refreshToken;
          }

          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: RefreshTokenPayload) {
    const { sub: userId, tokenId, sessionId } = payload;

    // Check if refresh token exists in Redis
    const storedToken = await this.redisService.get(`refresh_token:${tokenId}`);
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Verify the stored token matches the payload
    const storedPayload = JSON.parse(storedToken);
    if (
      storedPayload.userId !== userId ||
      storedPayload.sessionId !== sessionId
    ) {
      throw new UnauthorizedException('Invalid refresh token');
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

    return {
      userId: user.id,
      email: user.email,
      tokenId,
      sessionId,
      user,
    };
  }
}
