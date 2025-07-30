// src/auth/auth-core.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';

import { User } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { OAuthProvider } from '../database/entities/oauth-provider.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';

import { RedisModule } from '../redis/redis.module';
import { DatabaseModule } from '../database/database.module';

import { UserService } from './user.service';
import { SessionService } from './session.service';
import { OAuthService } from './oauth.service';
import { PasswordService } from './password.service';
import { EmailService } from './email.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
          issuer: configService.get<string>('JWT_ISSUER', 'mental-health-auth'),
          audience: configService.get<string>(
            'JWT_AUDIENCE',
            'mental-health-platform',
          ),
        },
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      UserSession,
      OAuthProvider,
      CounselorProfile,
    ]),
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60000, // 1 minute
        limit: 5, // 5 login attempts per minute
      },
      {
        name: 'register',
        ttl: 3600000, // 1 hour
        limit: 30, // 3 registration attempts per hour
      },
    ]),
  ],
  providers: [
    AuthService,
    UserService,
    SessionService,
    OAuthService,
    PasswordService,
    EmailService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    //FacebookStrategy, // Uncomment when Facebook login is implemented
  ],
  exports: [
    AuthService,
    UserService,
    SessionService,
    JwtStrategy,
    PassportModule,
  ],
})
export class AuthCoreModule {}
