// apps/scheduler-service/src/scheduling/services/scheduling.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { SchedulingController } from './scheduling.controler';
import { SchedulingService } from './scheduling.service';
import { EnhancedSchedulingService } from './enhanced-scheduling.service';
import { ReminderService } from './reminder.service';
import { MeetingRoomService } from './meeting-room.service';
import { CalendarService } from './calendar.service';
import { AvailabilityService } from './availability.service';
import { VideoIntegrationService } from './video-integration.service';
import { NotificationIntegrationService } from './notification-integration.service';

import { ScheduledMeeting } from '../entities/scheduled-meeting.entity';
import { CounselorTimeSlot } from '../entities/counselor-time-slot.entity';
import { MeetingReminder } from '../entities/meeting-reminder.entity';
import { MeetingParticipant } from '../entities/meeting-participant.entity';
import { SchedulingPreferences } from '../entities/scheduling-prefrences.entity';
import { CounselorProfile } from 'apps/user-service/src/database/entities/counselor-profile.entity';

import { MeetingEventListener } from '../listeners/meeting-event-listener';
import { MeetingAccessGuard } from '../guards/meeting-access.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScheduledMeeting,
      CounselorTimeSlot,
      MeetingReminder,
      MeetingParticipant,
      SchedulingPreferences,
      CounselorProfile,
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [SchedulingController],
  providers: [
    SchedulingService,
    EnhancedSchedulingService,
    ReminderService,
    MeetingRoomService,
    CalendarService,
    AvailabilityService,
    VideoIntegrationService,
    NotificationIntegrationService,
    MeetingEventListener,
    MeetingAccessGuard,
  ],
  exports: [
    SchedulingService,
    EnhancedSchedulingService,
    AvailabilityService,
    VideoIntegrationService,
    MeetingRoomService,
    CalendarService,
  ],
})
export class SchedulingModule {}