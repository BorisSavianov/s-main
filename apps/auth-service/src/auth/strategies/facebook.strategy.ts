// src/auth/strategies/facebook.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, VerifyCallback } from 'passport-facebook';

import { AuthService } from '../auth.service';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('FACEBOOK_CLIENT_ID'),
      clientSecret: configService.get<string>('FACEBOOK_CLIENT_SECRET'),
      callbackURL: configService.get<string>('FACEBOOK_CALLBACK_URL'),
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'name', 'emails', 'picture.type(large)'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;

    const userProfile = {
      id: id,
      provider: 'facebook' as const, // changed: explicit literal type assertion
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
        'facebook',
      );
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
}
