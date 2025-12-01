// src/scheduling/services/scheduling.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  Not,
  In,
  DeepPartial,
} from 'typeorm';
import {
  ScheduledMeeting,
  MeetingStatus,
  MeetingType,
  RecurringPattern,
} from '../entities/scheduled-meeting.entity';
import { CounselorTimeSlot } from '../entities/counselor-time-slot.entity';
import { MeetingReminder } from '../entities/meeting-reminder.entity';
import { SchedulingPreferences } from '../entities/scheduling-prefrences.entity';
import { CreateMeetingDto } from '../dto/create-meeting.dto';
import { UpdateMeetingDto } from '../dto/update-meeting.dto';
import { SchedulingQueryDto } from '../dto/scheduling-query.dto';
import { CreateTimeSlotDto } from '../dto/create-time-slot.dto';
import { NotificationIntegrationService } from './notification-integration.service';

@Injectable()
export class SchedulingService {
  constructor(
    @InjectRepository(ScheduledMeeting)
    private meetingRepository: Repository<ScheduledMeeting>,
    @InjectRepository(CounselorTimeSlot)
    private timeSlotRepository: Repository<CounselorTimeSlot>,
    @InjectRepository(MeetingReminder)
    private reminderRepository: Repository<MeetingReminder>,
    @InjectRepository(SchedulingPreferences)
    private preferencesRepository: Repository<SchedulingPreferences>,
    private readonly notificationIntegrationService: NotificationIntegrationService,
  ) {}

  // Meeting Management
  async createMeeting(
    userId: string,
    createMeetingDto: CreateMeetingDto,
  ): Promise<ScheduledMeeting> {
    const { scheduledStart, scheduledEnd, counselorId, ...meetingData } =
      createMeetingDto;

    // Validate time slot availability
    await this.validateTimeSlotAvailability(
      counselorId,
      new Date(scheduledStart),
      new Date(scheduledEnd),
    );

    // Check for conflicts
    await this.checkSchedulingConflicts(
      counselorId,
      new Date(scheduledStart),
      new Date(scheduledEnd),
    );

    // Create the meeting
    const meeting = this.meetingRepository.create({
      userId,
      counselorId,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      ...meetingData,
    });

    const savedMeeting = await this.meetingRepository.save(meeting);

    // Load related entities for notifications
    const meetingWithRelations = await this.meetingRepository.findOne({
      where: { id: savedMeeting.id },
      relations: ['user', 'counselor'],
    });

    // Send confirmation notification
    if (meetingWithRelations) {
      const userName =
        meetingWithRelations.user?.firstName +
          ' ' +
          meetingWithRelations.user?.lastName || 'User';
      const counselorName =
        meetingWithRelations.counselor?.firstName +
          ' ' +
          meetingWithRelations.counselor?.lastName || 'Counselor';

      await this.notificationIntegrationService.sendAppointmentConfirmation({
        userId: meetingWithRelations.userId,
        counselorId: meetingWithRelations.counselorId,
        appointmentId: meetingWithRelations.id,
        appointmentDate: meetingWithRelations.scheduledStart
          .toISOString()
          .split('T')[0],
        appointmentTime: meetingWithRelations.scheduledStart
          .toTimeString()
          .slice(0, 5),
        userName,
        counselorName,
      });
    }

    // Generate meeting room details if needed
    if (meeting.meetingType === MeetingType.VIDEO_CALL || meeting.meetingType === MeetingType.AUDIO_ONLY) {
      await this.generateMeetingRoomDetails(savedMeeting.id);
    }

    // Create recurring meetings if specified
    if (
      createMeetingDto.isRecurring &&
      createMeetingDto.recurringPattern !== RecurringPattern.NONE
    ) {
      await this.generateRecurringMeetings(
        savedMeeting.id,
        createMeetingDto.recurringUntil,
      );
    }

    return savedMeeting;
  }

  async getMeetings(userId: string, query: SchedulingQueryDto) {
    const queryBuilder = this.meetingRepository
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.user', 'user')
      .leftJoinAndSelect('meeting.counselor', 'counselor')
      .leftJoinAndSelect('meeting.reminders', 'reminders')
      .where('meeting.userId = :userId OR meeting.counselorId = :userId', {
        userId,
      });

    if (query.startDate) {
      queryBuilder.andWhere('meeting.scheduledStart >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query.endDate) {
      queryBuilder.andWhere('meeting.scheduledEnd <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    if (query.counselorId) {
      queryBuilder.andWhere('meeting.counselorId = :counselorId', {
        counselorId: query.counselorId,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('meeting.status = :status', {
        status: query.status,
      });
    }

    if (query.meetingType) {
      queryBuilder.andWhere('meeting.meetingType = :meetingType', {
        meetingType: query.meetingType,
      });
    }

    queryBuilder
      .orderBy('meeting.scheduledStart', 'ASC')
      .skip((query.page! - 1) * query.limit!)
      .take(query.limit);

    const [meetings, total] = await queryBuilder.getManyAndCount();

    return {
      meetings,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit!),
    };
  }

  async getMeetingById(id: string, userId: string): Promise<ScheduledMeeting> {
    const meeting = await this.meetingRepository.findOne({
      where: { id },
      relations: ['user', 'counselor', 'reminders', 'participants'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Check if user has access to this meeting
    if (meeting.userId !== userId && meeting.counselorId !== userId) {
      throw new NotFoundException('Meeting not found');
    }

    return meeting;
  }

  async updateMeeting(
    id: string,
    userId: string,
    updateMeetingDto: UpdateMeetingDto,
  ): Promise<ScheduledMeeting> {
    const meeting = await this.getMeetingById(id, userId);

    // Check if user can update this meeting
    if (meeting.userId !== userId && meeting.counselorId !== userId) {
      throw new BadRequestException(
        'You are not authorized to update this meeting',
      );
    }

    // If rescheduling, validate new time
    if (updateMeetingDto.scheduledStart || updateMeetingDto.scheduledEnd) {
      const newStart = updateMeetingDto.scheduledStart
        ? new Date(updateMeetingDto.scheduledStart)
        : meeting.scheduledStart;
      const newEnd = updateMeetingDto.scheduledEnd
        ? new Date(updateMeetingDto.scheduledEnd)
        : meeting.scheduledEnd;

      await this.validateTimeSlotAvailability(
        meeting.counselorId,
        newStart,
        newEnd,
        meeting.id,
      );
      await this.checkSchedulingConflicts(
        meeting.counselorId,
        newStart,
        newEnd,
        meeting.id,
      );
    }

    Object.assign(meeting, updateMeetingDto);

    if (updateMeetingDto.scheduledStart) {
      meeting.scheduledStart = new Date(updateMeetingDto.scheduledStart);
    }
    if (updateMeetingDto.scheduledEnd) {
      meeting.scheduledEnd = new Date(updateMeetingDto.scheduledEnd);
    }
    if (updateMeetingDto.actualStart) {
      meeting.actualStart = new Date(updateMeetingDto.actualStart);
    }
    if (updateMeetingDto.actualEnd) {
      meeting.actualEnd = new Date(updateMeetingDto.actualEnd);
    }

    return await this.meetingRepository.save(meeting);
  }

  async cancelMeeting(
    id: string,
    userId: string,
    reason?: string,
  ): Promise<ScheduledMeeting> {
    const meeting = await this.getMeetingById(id, userId);

    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('Meeting is already cancelled');
    }

    if (meeting.status === MeetingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed meeting');
    }

    meeting.status = MeetingStatus.CANCELLED;
    meeting.cancelledBy = userId;
    meeting.cancelledAt = new Date();
    meeting.cancellationReason = reason!;

    const cancelledMeeting = await this.meetingRepository.save(meeting);

    // Send cancellation notification
    const userName =
      meeting.user?.firstName + ' ' + meeting.user?.lastName || 'User';
    const counselorName =
      meeting.counselor?.firstName + ' ' + meeting.counselor?.lastName ||
      'Counselor';

    await this.notificationIntegrationService.sendAppointmentCancellation({
      userId: meeting.userId,
      counselorId: meeting.counselorId,
      appointmentId: meeting.id,
      appointmentDate: meeting.scheduledStart.toISOString().split('T')[0],
      appointmentTime: meeting.scheduledStart.toTimeString().slice(0, 5),
      userName,
      counselorName,
      reason,
      cancelledBy: userId === meeting.userId ? 'user' : 'counselor',
    });

    return cancelledMeeting;
  }

  async confirmMeeting(id: string, userId: string): Promise<ScheduledMeeting> {
    const meeting = await this.getMeetingById(id, userId);

    if (meeting.status !== MeetingStatus.SCHEDULED) {
      throw new BadRequestException('Meeting cannot be confirmed');
    }

    if (meeting.userId === userId) {
      meeting.confirmedByUser = true;
    } else if (meeting.counselorId === userId) {
      meeting.confirmedByCounselor = true;
    }

    // Check if both parties have confirmed
    if (meeting.confirmedByUser && meeting.confirmedByCounselor) {
      meeting.status = MeetingStatus.CONFIRMED;
      meeting.confirmedAt = new Date();
    }

    return await this.meetingRepository.save(meeting);
  }

  // Time Slot Management
  async createTimeSlot(
    counselorId: string,
    createTimeSlotDto: CreateTimeSlotDto,
  ): Promise<CounselorTimeSlot> {
    const timeSlot = this.timeSlotRepository.create({
      counselorId,
      ...createTimeSlotDto,
      slotDate: new Date(createTimeSlotDto.slotDate),
      recurringUntil: createTimeSlotDto.recurringUntil
        ? new Date(createTimeSlotDto.recurringUntil)
        : undefined,
    });

    return await this.timeSlotRepository.save(timeSlot);
  }

  async getAvailableTimeSlots(
    counselorId: string,
    startDate: string,
    endDate: string,
  ): Promise<CounselorTimeSlot[]> {
    return await this.timeSlotRepository.find({
      where: {
        counselorId,
        slotDate: Between(new Date(startDate), new Date(endDate)),
        isAvailable: true,
        isBooked: false,
      },
      order: {
        slotDate: 'ASC',
        startTime: 'ASC',
      },
    });
  }

  async getCounselorTimeSlots(
    counselorId: string,
    date?: string,
  ): Promise<CounselorTimeSlot[]> {
    const query: any = { counselorId };

    if (date) {
      query.slotDate = new Date(date);
    }

    return await this.timeSlotRepository.find({
      where: query,
      order: {
        slotDate: 'ASC',
        startTime: 'ASC',
      },
    });
  }

  async updateTimeSlot(
    id: string,
    counselorId: string,
    updateData: Partial<CreateTimeSlotDto>,
  ): Promise<CounselorTimeSlot> {
    const timeSlot = await this.timeSlotRepository.findOne({
      where: { id, counselorId },
    });

    if (!timeSlot) {
      throw new NotFoundException('Time slot not found');
    }

    Object.assign(timeSlot, updateData);

    if (updateData.slotDate) {
      timeSlot.slotDate = new Date(updateData.slotDate);
    }
    if (updateData.recurringUntil) {
      timeSlot.recurringUntil = new Date(updateData.recurringUntil);
    }

    return await this.timeSlotRepository.save(timeSlot);
  }

  async deleteTimeSlot(id: string, counselorId: string): Promise<void> {
    const timeSlot = await this.timeSlotRepository.findOne({
      where: { id, counselorId },
    });

    if (!timeSlot) {
      throw new NotFoundException('Time slot not found');
    }

    if (timeSlot.isBooked) {
      throw new BadRequestException('Cannot delete a booked time slot');
    }

    await this.timeSlotRepository.remove(timeSlot);
  }

  // Availability Management
  async getCounselorAvailability(
    counselorId: string,
    startDate: string,
    endDate: string,
  ) {
    const timeSlots = await this.getAvailableTimeSlots(
      counselorId,
      startDate,
      endDate,
    );
    const meetings = await this.meetingRepository.find({
      where: {
        counselorId,
        scheduledStart: Between(new Date(startDate), new Date(endDate)),
        status: Not(In([MeetingStatus.CANCELLED, MeetingStatus.NO_SHOW])),
      },
    });

    // Group by date
    const availabilityByDate: Record<string, any> = {};

    timeSlots.forEach((slot) => {
      const dateKey = slot.slotDate.toISOString().split('T')[0];
      if (!availabilityByDate[dateKey]) {
        availabilityByDate[dateKey] = {
          date: dateKey,
          slots: [],
          meetings: [],
        };
      }
      availabilityByDate[dateKey].slots.push(slot);
    });

    meetings.forEach((meeting) => {
      const dateKey = meeting.scheduledStart.toISOString().split('T')[0];
      if (availabilityByDate[dateKey]) {
        availabilityByDate[dateKey].meetings.push(meeting);
      }
    });

    return Object.values(availabilityByDate);
  }

  // Preferences Management
  async getSchedulingPreferences(
    userId: string,
  ): Promise<SchedulingPreferences> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.preferencesRepository.create({ userId });
      preferences = await this.preferencesRepository.save(preferences);
    }

    return preferences;
  }

  async updateSchedulingPreferences(
    userId: string,
    updateData: Partial<SchedulingPreferences>,
  ): Promise<SchedulingPreferences> {
    let preferences = await this.getSchedulingPreferences(userId);

    Object.assign(preferences, updateData);

    return await this.preferencesRepository.save(preferences);
  }

  // Reminder Management
  async getPendingReminders(): Promise<MeetingReminder[]> {
    const now = new Date();
    return await this.reminderRepository.find({
      where: {
        isSent: false,
        scheduledTime: LessThanOrEqual(now),
      },
      relations: ['meeting', 'recipient'],
    });
  }

  async markReminderAsSent(reminderId: string): Promise<void> {
    await this.reminderRepository.update(reminderId, {
      isSent: true,
      sentAt: new Date(),
    });
  }

  async acknowledgeReminder(reminderId: string, userId: string): Promise<void> {
    const reminder = await this.reminderRepository.findOne({
      where: { id: reminderId, recipientId: userId },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    reminder.isAcknowledged = true;
    reminder.acknowledgedAt = new Date();

    await this.reminderRepository.save(reminder);
  }

 private async validateTimeSlotAvailability(
  counselorId: string,
  startTime: Date,
  endTime: Date,
  excludeMeetingId?: string,
): Promise<void> {
  const dateStr = startTime.toISOString().split('T')[0];

  const slots = await this.timeSlotRepository.find({
    where: {
      counselorId,
      slotDate: dateStr as any,
      isAvailable: true,
    },
  });

  if (!slots || slots.length === 0) {
    throw new ConflictException('No available time slot found for the requested date');
  }

  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const requestedStartMin = toMinutes(startTime.toISOString().split('T')[1].slice(0, 5));
  const requestedEndMin = toMinutes(endTime.toISOString().split('T')[1].slice(0, 5));

  const validSlot = slots.find((slot) => {
    const slotStartMin = toMinutes(slot.startTime);
    const slotEndMin = toMinutes(slot.endTime);

    const coversTime =
      requestedStartMin >= slotStartMin &&
      requestedEndMin <= slotEndMin;

    const notFullyBooked = !slot.isBooked;

    return coversTime && notFullyBooked;
  });

  if (!validSlot) {
    throw new ConflictException(
      'Requested time is outside available time slot or slot is fully booked',
    );
  }
}


  private async checkSchedulingConflicts(
    counselorId: string,
    startTime: Date,
    endTime: Date,
    excludeMeetingId?: string,
  ): Promise<void> {
    const query = this.meetingRepository
      .createQueryBuilder('meeting')
      .where('meeting.counselorId = :counselorId', { counselorId })
      .andWhere('meeting.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [MeetingStatus.CANCELLED, MeetingStatus.NO_SHOW],
      })
      .andWhere(
        '(meeting.scheduledStart < :endTime AND meeting.scheduledEnd > :startTime)',
        { startTime, endTime },
      );

    if (excludeMeetingId) {
      query.andWhere('meeting.id != :excludeMeetingId', { excludeMeetingId });
    }

    const conflictingMeeting = await query.getOne();

    if (conflictingMeeting) {
      throw new ConflictException('Time slot conflicts with existing meeting');
    }
  }

  private async generateMeetingRoomDetails(meetingId: string): Promise<void> {
    // Generate unique meeting room details
    const roomId = `room_${meetingId.slice(-8)}`;
    const roomUrl = `http://localhost:3000/room/${roomId}`;
    const roomPassword = Math.random().toString(36).slice(-8);

    await this.meetingRepository.update(meetingId, {
      meetingRoomId: roomId,
      meetingRoomUrl: roomUrl,
      meetingRoomPassword: roomPassword,
    });
  }

  private async generateRecurringMeetings(
    parentMeetingId: string,
    endDate?: string,
  ): Promise<number> {
    const parentMeeting = await this.meetingRepository.findOne({
      where: { id: parentMeetingId },
    });

    if (!parentMeeting || !parentMeeting.isRecurring) {
      return 0;
    }

    const endDateTime = endDate
      ? new Date(endDate)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default
    let currentStart = new Date(parentMeeting.scheduledStart);
    let currentEnd = new Date(parentMeeting.scheduledEnd);
    let createdCount = 0;

    while (currentStart < endDateTime) {
      // Calculate next occurrence based on pattern
      switch (parentMeeting.recurringPattern) {
        case 'daily':
          currentStart.setDate(
            currentStart.getDate() + parentMeeting.recurringInterval,
          );
          currentEnd.setDate(
            currentEnd.getDate() + parentMeeting.recurringInterval,
          );
          break;
        case 'weekly':
          currentStart.setDate(
            currentStart.getDate() + 7 * parentMeeting.recurringInterval,
          );
          currentEnd.setDate(
            currentEnd.getDate() + 7 * parentMeeting.recurringInterval,
          );
          break;
        case 'biweekly':
          currentStart.setDate(
            currentStart.getDate() + 14 * parentMeeting.recurringInterval,
          );
          currentEnd.setDate(
            currentEnd.getDate() + 14 * parentMeeting.recurringInterval,
          );
          break;
        case 'monthly':
          currentStart.setMonth(
            currentStart.getMonth() + parentMeeting.recurringInterval,
          );
          currentEnd.setMonth(
            currentEnd.getMonth() + parentMeeting.recurringInterval,
          );
          break;
        default:
          return createdCount;
      }

      if (currentStart >= endDateTime) break;

      // Create recurring meeting
      const recurringMeeting = this.meetingRepository.create({
        ...parentMeeting,
        parentMeetingId: parentMeetingId,
        scheduledStart: new Date(currentStart),
        scheduledEnd: new Date(currentEnd),
        isRecurring: false, // Individual instances are not recurring
        recurringPattern: RecurringPattern.NONE,
        status: MeetingStatus.SCHEDULED,
        confirmedByUser: false,
        confirmedByCounselor: false,
        confirmedAt: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      });

      await this.meetingRepository.save(recurringMeeting);
      createdCount++;
    }

    return createdCount;
  }

  // Statistics and Analytics
  async getMeetingStatistics(userId: string, isProvider: boolean = false) {
    const whereClause = isProvider ? { counselorId: userId } : { userId };

    const totalMeetings = await this.meetingRepository.count({
      where: whereClause,
    });
    const completedMeetings = await this.meetingRepository.count({
      where: { ...whereClause, status: MeetingStatus.COMPLETED },
    });
    const upcomingMeetings = await this.meetingRepository.count({
      where: {
        ...whereClause,
        status: In([MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED]),
        scheduledStart: MoreThanOrEqual(new Date()),
      },
    });
    const cancelledMeetings = await this.meetingRepository.count({
      where: { ...whereClause, status: MeetingStatus.CANCELLED },
    });

    return {
      totalMeetings,
      completedMeetings,
      upcomingMeetings,
      cancelledMeetings,
      completionRate:
        totalMeetings > 0 ? (completedMeetings / totalMeetings) * 100 : 0,
      cancellationRate:
        totalMeetings > 0 ? (cancelledMeetings / totalMeetings) * 100 : 0,
    };
  }

  async getUpcomingMeetings(
    userId: string,
    limit: number = 5,
  ): Promise<ScheduledMeeting[]> {
    return await this.meetingRepository.find({
      where: [
        {
          userId,
          scheduledStart: MoreThanOrEqual(new Date()),
          status: In([MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED]),
        },
        {
          counselorId: userId,
          scheduledStart: MoreThanOrEqual(new Date()),
          status: In([MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED]),
        },
      ],
      relations: ['user', 'counselor'],
      order: { scheduledStart: 'ASC' },
      take: limit,
    });
  }
}
