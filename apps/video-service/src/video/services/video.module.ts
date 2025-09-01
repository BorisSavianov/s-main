import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';

import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { SchedulingIntegrationService } from './scheduling-integration.service';
import { VideoGateway } from '../gateways/video.gateway';
import { WsJwtGuard } from '../../guards/ws-jwt.guard';

import { VideoRoom } from '../entities/video-room.entity';
import { VideoParticipant } from '../entities/video-participant.entity';
import { VideoSession } from '../entities/video-session.entity';
import { CounselorProfile } from 'apps/auth-service/src/database/entities/counselor-profile.entity';
import { OAuthProvider } from 'apps/auth-service/src/database/entities/oauth-provider.entity';
import { UserSession } from 'apps/auth-service/src/database/entities/user-session.entity';
import { User } from 'apps/auth-service/src/database/entities/user.entity';
import { Notification } from 'apps/notification-service/src/notifications/entities/notification.entity';
import { PushSubscription } from 'apps/notification-service/src/notifications/entities/push-subscription.entity';
import { NotificationTemplate } from 'apps/notification-service/src/templates/entities/notification-template.entity';
import { NotificationPreference } from 'apps/notification-service/src/prefrences/entities/notification-prefrence.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VideoParticipant,
      VideoRoom,
      VideoSession,
      User,
      UserSession,
      OAuthProvider,
      CounselorProfile,
      Notification,
      PushSubscription,
      NotificationTemplate,
      NotificationPreference,
    ]),
    ConfigModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [VideoController],
  providers: [
    VideoService,
    SchedulingIntegrationService,
    VideoGateway,
    WsJwtGuard,
  ],
  exports: [VideoService, SchedulingIntegrationService],
})
export class VideoModule {}
