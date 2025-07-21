// src/auth/strategies/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    if (!profile) {
      return done(new TypeError('Profile is undefined'), undefined);
    }

    const { id, name, emails, photos } = profile;

    const userProfile = {
      id: id,
      provider: 'google' as const,
      email: emails?.[0]?.value,
      firstName: name?.givenName,
      lastName: name?.familyName,
      profilePictureUrl: photos?.[0]?.value,
      accessToken,
      refreshToken,
    };

    try {
      const user = await this.authService.validateOAuthUser(
        userProfile,
        'google',
      );
      done(null, user!);
    } catch (error) {
      done(error, undefined);
    }
  }
}
