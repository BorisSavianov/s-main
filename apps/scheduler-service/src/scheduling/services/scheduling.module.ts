// Updated src/scheduling/scheduling.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';

import { SchedulingController } from './scheduling.controler';
import { SchedulingService } from './scheduling.service';
import { ReminderService } from './reminder.service';
import { MeetingRoomService } from './meeting-room.service';
import { CalendarService } from './calendar.service';
import { AvailabilityService } from './availability.service';

import { ScheduledMeeting } from '../entities/scheduled-meeting.entity';
import { CounselorTimeSlot } from '../entities/counselor-time-slot.entity';
import { MeetingReminder } from '../entities/meeting-reminder.entity';
import { MeetingParticipant } from '../entities/meeting-participant.entity';
import { SchedulingPreferences } from '../entities/scheduling-prefrences.entity';

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
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule,
  ],
  controllers: [SchedulingController],
  providers: [
    SchedulingService,
    ReminderService,
    MeetingRoomService,
    CalendarService,
    AvailabilityService,
    MeetingEventListener,
    MeetingAccessGuard,
  ],
  exports: [
    SchedulingService,
    AvailabilityService,
    MeetingRoomService,
    CalendarService,
  ],
})
export class SchedulingModule {}
