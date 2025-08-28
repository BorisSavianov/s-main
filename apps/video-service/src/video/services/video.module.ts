// apps/video-service/src/video/services/video.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { SchedulingIntegrationService } from './scheduling-integration.service';
import { VideoGateway } from '../gateways/video.gateway';

import { VideoRoom } from '../entities/video-room.entity';
import { VideoParticipant } from '../entities/video-participant.entity';
import { VideoSession } from '../entities/video-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoRoom, VideoParticipant, VideoSession]),
    ConfigModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [VideoController],
  providers: [VideoService, SchedulingIntegrationService, VideoGateway],
  exports: [VideoService, SchedulingIntegrationService],
})
export class VideoModule {}
