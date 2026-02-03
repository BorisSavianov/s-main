// src/scheduling/services/availability.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import { CounselorTimeSlot } from '../entities/counselor-time-slot.entity';
import {
  ScheduledMeeting,
  MeetingStatus,
} from '../entities/scheduled-meeting.entity';
import { SchedulingPreferences } from '../entities/scheduling-prefrences.entity';
import { CounselorProfile } from 'apps/user-service/src/database/entities/counselor-profile.entity';

export interface AvailabilitySlot {
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  isAvailable: boolean;
  price?: number;
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);
  constructor(
    @InjectRepository(CounselorTimeSlot)
    private timeSlotRepository: Repository<CounselorTimeSlot>,
    @InjectRepository(ScheduledMeeting)
    private meetingRepository: Repository<ScheduledMeeting>,
    @InjectRepository(SchedulingPreferences)
    private preferencesRepository: Repository<SchedulingPreferences>,
    @InjectRepository(CounselorProfile)
    private counselorProfileRepository: Repository<CounselorProfile>,
  ) {
  }

async generateAvailabilitySlots(
  userId: string,
  startDate: Date,
  endDate: Date,
  slotDuration: number = 60,
  searchStartTime?: string,
  searchEndTime?: string,
): Promise<AvailabilitySlot[]> {

  const timeSlots = await this.timeSlotRepository.find({
    where: {
      counselorId: userId,
      slotDate: Between(startDate, endDate),
      isAvailable: true,
    },
    order: { slotDate: 'ASC', startTime: 'ASC' },
  });

  const bookedMeetings = await this.meetingRepository.find({
    where: {
      userId,
      scheduledStart: Between(startDate, endDate),
      status: Not(In([MeetingStatus.CANCELLED, MeetingStatus.NO_SHOW])),
    },
  });

  const availability: AvailabilitySlot[] = [];

  for (const timeSlot of timeSlots) {
    const dateStr = new Date(timeSlot.slotDate).toISOString().split('T')[0];

    const rangeStart = new Date(`${dateStr}T${timeSlot.startTime}Z`);
    const rangeEnd = new Date(`${dateStr}T${timeSlot.endTime}Z`);

    // --- SPLIT INTO MULTIPLE SLOTS BY DURATION ---
    let current = new Date(rangeStart);

    while (current < rangeEnd) {
      const next = new Date(current.getTime() + slotDuration * 60000);

      if (next > rangeEnd) break; // Do not exceed the counselor range

      const slotStartIso = current.toISOString();
      const slotEndIso = next.toISOString();

      const slotStartStr = slotStartIso.split('T')[1].slice(0, 5);
      const slotEndStr = slotEndIso.split('T')[1].slice(0, 5);

      // --- Search-based filtering ---
      if (searchStartTime && slotStartStr < searchStartTime) {
        current = next;
        continue;
      }

      if (searchEndTime && slotEndStr > searchEndTime) {
        current = next;
        continue;
      }

      // --- Check meeting conflicts ---
      const conflict = bookedMeetings.some((m) => {
        const mStart = new Date(m.scheduledStart);
        const mEnd = new Date(m.scheduledEnd);

        return (
          new Date(slotStartIso) < mEnd &&
          new Date(slotEndIso) > mStart
        );
      });

      if (!conflict) {
        availability.push({
          date: dateStr,
          startTime: slotStartStr,
          endTime: slotEndStr,
          duration: slotDuration,
          isAvailable: true,
          price: timeSlot.customRate,
        });
      }

      current = next;
    }
  }

  return availability;
}


  async bulkCreateTimeSlots(
    counselorId: string,
    startDate: Date,
    endDate: Date,
    dailySchedule: { startTime: string; endTime: string; duration: number }[],
    excludeWeekends: boolean = true,
  ): Promise<CounselorTimeSlot[]> {
    const timeSlots: CounselorTimeSlot[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();

      // Skip weekends if excluded
      if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      for (const schedule of dailySchedule) {
        const timeSlot = this.timeSlotRepository.create({
          counselorId,
          slotDate: new Date(currentDate),
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          slotDurationMinutes: schedule.duration,
          isAvailable: true,
        });

        timeSlots.push(timeSlot);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return await this.timeSlotRepository.save(timeSlots);
  }
}
