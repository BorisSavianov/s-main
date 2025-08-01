// src/scheduling/services/availability.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import { CounselorTimeSlot } from '../entities/counselor-time-slot.entity';
import {
  ScheduledMeeting,
  MeetingStatus,
} from '../entities/scheduled-meeting.entity';
import { SchedulingPreferences } from '../entities/scheduling-prefrences.entity';

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
  constructor(
    @InjectRepository(CounselorTimeSlot)
    private timeSlotRepository: Repository<CounselorTimeSlot>,
    @InjectRepository(ScheduledMeeting)
    private meetingRepository: Repository<ScheduledMeeting>,
    @InjectRepository(SchedulingPreferences)
    private preferencesRepository: Repository<SchedulingPreferences>,
  ) {}

  async generateAvailabilitySlots(
    counselorId: string,
    startDate: Date,
    endDate: Date,
    slotDuration: number = 60,
  ): Promise<AvailabilitySlot[]> {
    const timeSlots = await this.timeSlotRepository.find({
      where: {
        counselorId,
        slotDate: Between(startDate, endDate),
        isAvailable: true,
      },
      order: { slotDate: 'ASC', startTime: 'ASC' },
    });

    const bookedMeetings = await this.meetingRepository.find({
      where: {
        counselorId,
        scheduledStart: Between(startDate, endDate),
        status: Not(In([MeetingStatus.CANCELLED, MeetingStatus.NO_SHOW])),
      },
    });

    const availabilitySlots: AvailabilitySlot[] = [];

    for (const timeSlot of timeSlots) {
      const slotStart = new Date(`${timeSlot.slotDate}T${timeSlot.startTime}`);
      const slotEnd = new Date(`${timeSlot.slotDate}T${timeSlot.endTime}`);

      // Generate slots within this time slot
      let currentTime = new Date(slotStart);

      while (currentTime < slotEnd) {
        const slotEndTime = new Date(
          currentTime.getTime() + slotDuration * 60000,
        );

        if (slotEndTime > slotEnd) break;

        // Check if this slot conflicts with any booked meeting
        const hasConflict = bookedMeetings.some((meeting) => {
          const meetingStart = new Date(meeting.scheduledStart);
          const meetingEnd = new Date(meeting.scheduledEnd);

          return currentTime < meetingEnd && slotEndTime > meetingStart;
        });

        availabilitySlots.push({
          date: timeSlot.slotDate.toISOString().split('T')[0],
          startTime: currentTime.toTimeString().substring(0, 5),
          endTime: slotEndTime.toTimeString().substring(0, 5),
          duration: slotDuration,
          isAvailable: !hasConflict && !timeSlot.isBooked,
          price: timeSlot.customRate,
        });

        currentTime = new Date(slotEndTime);
      }
    }

    return availabilitySlots;
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
