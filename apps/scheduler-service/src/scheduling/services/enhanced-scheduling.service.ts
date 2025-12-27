// apps/scheduler-service/src/scheduling/services/enhanced-scheduling.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, Not, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ScheduledMeeting,
  MeetingStatus,
  MeetingType,
} from '../entities/scheduled-meeting.entity';
import { CreateMeetingDto } from '../dto/create-meeting.dto';
import { UpdateMeetingDto } from '../dto/update-meeting.dto';
import { VideoIntegrationService } from './video-integration.service';
import { NotificationIntegrationService } from './notification-integration.service';

@Injectable()
export class EnhancedSchedulingService {
  private readonly logger = new Logger(EnhancedSchedulingService.name);

  constructor(
    @InjectRepository(ScheduledMeeting)
    private meetingRepository: Repository<ScheduledMeeting>,
    private videoIntegrationService: VideoIntegrationService,
    private notificationService: NotificationIntegrationService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create meeting with automatic video room creation
   */
  async createMeetingWithRoom(
    userId: string,
    createMeetingDto: CreateMeetingDto,
  ): Promise<ScheduledMeeting> {
    const { scheduledStart, scheduledEnd, counselorId, meetingType, ...meetingData } =
      createMeetingDto;

    // Validate time slot availability
    await this.validateTimeSlotAvailability(
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
      meetingType,
      ...meetingData,
    });

    const savedMeeting = await this.meetingRepository.save(meeting);

    // Create video room if needed
    if (
      meetingType === MeetingType.VIDEO_CALL ||
      meetingType === MeetingType.AUDIO_ONLY
    ) {
      try {
        const roomDetails = await this.videoIntegrationService.createRoomForMeeting(
          savedMeeting,
        );

        // Update meeting with room details
        savedMeeting.meetingRoomId = roomDetails.roomId;
        savedMeeting.meetingRoomUrl = roomDetails.meetingRoomUrl;
        savedMeeting.meetingRoomPassword = roomDetails.accessCode;

        await this.meetingRepository.save(savedMeeting);

        this.logger.log(
          `Meeting ${savedMeeting.id} created with video room ${roomDetails.roomId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create video room for meeting ${savedMeeting.id}`,
          error,
        );
        // Continue without room - can be created later
      }
    }

    // Send notifications
    const meetingWithRelations = await this.meetingRepository.findOne({
      where: { id: savedMeeting.id },
      relations: ['user', 'counselor'],
    });

    if (meetingWithRelations) {
      await this.sendMeetingCreatedNotifications(meetingWithRelations);
    }

    // Emit event
    this.eventEmitter.emit('meeting.created', {
      meetingId: savedMeeting.id,
      userId,
      counselorId,
      scheduledStart: savedMeeting.scheduledStart,
      hasVideoRoom: !!savedMeeting.meetingRoomId,
    });

    return savedMeeting;
  }

  /**
   * Update meeting and sync with video room
   */
  async updateMeetingWithRoom(
    id: string,
    userId: string,
    updateMeetingDto: UpdateMeetingDto,
  ): Promise<ScheduledMeeting> {
    const meeting = await this.meetingRepository.findOne({
      where: { id },
      relations: ['user', 'counselor'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Check authorization
    if (meeting.userId !== userId && meeting.counselorId !== userId) {
      throw new BadRequestException('Not authorized to update this meeting');
    }

    const originalStart = meeting.scheduledStart;
    const isRescheduling =
      updateMeetingDto.scheduledStart &&
      new Date(updateMeetingDto.scheduledStart).getTime() !== originalStart.getTime();

    // If rescheduling, validate new time
    if (isRescheduling) {
      const newStart = new Date(updateMeetingDto.scheduledStart!);
      const newEnd = updateMeetingDto.scheduledEnd
        ? new Date(updateMeetingDto.scheduledEnd)
        : new Date(newStart.getTime() + meeting.durationMinutes * 60000);

      await this.validateTimeSlotAvailability(
        meeting.counselorId,
        newStart,
        newEnd,
        meeting.id,
      );

      meeting.rescheduledFrom = meeting.id;
      meeting.status = MeetingStatus.RESCHEDULED;
    }

    // Apply updates
    Object.assign(meeting, updateMeetingDto);

    if (updateMeetingDto.scheduledStart) {
      meeting.scheduledStart = new Date(updateMeetingDto.scheduledStart);
    }
    if (updateMeetingDto.scheduledEnd) {
      meeting.scheduledEnd = new Date(updateMeetingDto.scheduledEnd);
    }

    const updatedMeeting = await this.meetingRepository.save(meeting);

    // If meeting type changed to/from video, handle room
    if (updateMeetingDto.meetingType) {
      await this.handleMeetingTypeChange(updatedMeeting, updateMeetingDto.meetingType);
    }

    // Send notifications for rescheduling
    if (isRescheduling) {
      await this.sendRescheduledNotifications(updatedMeeting);
    }

    return updatedMeeting;
  }

  /**
   * Cancel meeting and end video room
   */
  async cancelMeetingWithRoom(
    id: string,
    userId: string,
    reason?: string,
  ): Promise<ScheduledMeeting> {
    const meeting = await this.meetingRepository.findOne({
      where: { id },
      relations: ['user', 'counselor'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('Meeting is already cancelled');
    }

    meeting.status = MeetingStatus.CANCELLED;
    meeting.cancelledBy = userId;
    meeting.cancelledAt = new Date();
    meeting.cancellationReason = reason || '';

    const cancelledMeeting = await this.meetingRepository.save(meeting);

    // End video room if exists and active
    if (meeting.meetingRoomId) {
      try {
        const isActive = await this.videoIntegrationService.isRoomActive(
          meeting.meetingRoomId,
        );
        if (isActive) {
          await this.videoIntegrationService.endRoom(meeting.meetingRoomId, userId);
          this.logger.log(`Ended video room ${meeting.meetingRoomId} for cancelled meeting`);
        }
      } catch (error) {
        this.logger.error(`Failed to end video room: ${error.message}`);
      }
    }

    // Send cancellation notifications
    await this.sendCancellationNotifications(cancelledMeeting);

    // Emit event
    this.eventEmitter.emit('meeting.cancelled', {
      meetingId: meeting.id,
      cancelledBy: userId,
      reason,
    });

    return cancelledMeeting;
  }

  /**
   * Start meeting (transition to in-progress)
   */
  async startMeeting(id: string, userId: string): Promise<ScheduledMeeting> {
    const meeting = await this.meetingRepository.findOne({
      where: { id },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.userId !== userId && meeting.counselorId !== userId) {
      throw new BadRequestException('Not authorized');
    }

    if (meeting.status !== MeetingStatus.CONFIRMED && meeting.status !== MeetingStatus.SCHEDULED) {
      throw new BadRequestException('Meeting cannot be started');
    }

    meeting.status = MeetingStatus.IN_PROGRESS;
    meeting.actualStart = new Date();

    const startedMeeting = await this.meetingRepository.save(meeting);

    this.logger.log(`Meeting ${id} started by user ${userId}`);

    return startedMeeting;
  }

  /**
   * Complete meeting and get room stats
   */
  async completeMeeting(id: string, userId: string): Promise<ScheduledMeeting> {
    const meeting = await this.meetingRepository.findOne({
      where: { id },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    meeting.status = MeetingStatus.COMPLETED;
    meeting.actualEnd = new Date();

    // Get room stats if video meeting
    if (meeting.meetingRoomId) {
      try {
        const participantCount = await this.videoIntegrationService.getRoomParticipantsCount(
          meeting.meetingRoomId,
        );
        
        // Store in session notes
        meeting.sessionNotes = meeting.sessionNotes || '';
        meeting.sessionNotes += `\n\nVideo session statistics: ${participantCount} participant(s)`;

        // End the room
        await this.videoIntegrationService.endRoom(meeting.meetingRoomId, userId);
      } catch (error) {
        this.logger.error(`Failed to get room stats: ${error.message}`);
      }
    }

    const completedMeeting = await this.meetingRepository.save(meeting);

    this.logger.log(`Meeting ${id} completed`);

    return completedMeeting;
  }

  /**
   * Get meeting with room status
   */
  async getMeetingWithRoomStatus(id: string, userId: string): Promise<any> {
    const meeting = await this.meetingRepository.findOne({
      where: { id },
      relations: ['user', 'counselor'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.userId !== userId && meeting.counselorId !== userId) {
      throw new NotFoundException('Meeting not found');
    }

    const result: any = { ...meeting };

    // Add room status if video meeting
    if (meeting.meetingRoomId) {
      try {
        const isActive = await this.videoIntegrationService.isRoomActive(
          meeting.meetingRoomId,
        );
        const participantCount = isActive
          ? await this.videoIntegrationService.getRoomParticipantsCount(
              meeting.meetingRoomId,
            )
          : 0;

        result.roomStatus = {
          isActive,
          participantCount,
          canJoin: this.canJoinMeeting(meeting),
        };
      } catch (error) {
        this.logger.error(`Failed to get room status: ${error.message}`);
        result.roomStatus = { isActive: false, participantCount: 0, canJoin: false };
      }
    }

    return result;
  }

  /**
   * Ensure video room exists for meeting (lazy creation)
   */
  async ensureVideoRoom(meetingId: string): Promise<string> {
    const meeting = await this.meetingRepository.findOne({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // If room already exists, return it
    if (meeting.meetingRoomId) {
      return meeting.meetingRoomUrl || '';
    }

    // Create room if needed
    if (
      meeting.meetingType === MeetingType.VIDEO_CALL ||
      meeting.meetingType === MeetingType.AUDIO_ONLY
    ) {
      const roomDetails = await this.videoIntegrationService.createRoomForMeeting(
        meeting,
      );

      meeting.meetingRoomId = roomDetails.roomId;
      meeting.meetingRoomUrl = roomDetails.meetingRoomUrl;
      meeting.meetingRoomPassword = roomDetails.accessCode;

      await this.meetingRepository.save(meeting);

      return meeting.meetingRoomUrl;
    }

    throw new BadRequestException('Meeting type does not support video rooms');
  }

  /**
   * Cron job: Auto-start meetings when scheduled time arrives
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoTransitionMeetings() {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);

    try {
      // Find meetings that should be starting soon
      const upcomingMeetings = await this.meetingRepository.find({
        where: {
          scheduledStart: Between(fiveMinutesAgo, fiveMinutesFromNow),
          status: In([MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED]),
        },
      });

      for (const meeting of upcomingMeetings) {
        // Ensure video room exists
        if (
          (meeting.meetingType === MeetingType.VIDEO_CALL ||
            meeting.meetingType === MeetingType.AUDIO_ONLY) &&
          !meeting.meetingRoomId
        ) {
          try {
            await this.ensureVideoRoom(meeting.id);
            this.logger.log(`Auto-created video room for meeting ${meeting.id}`);
          } catch (error) {
            this.logger.error(
              `Failed to auto-create room for meeting ${meeting.id}:`,
              error.message,
            );
          }
        }
      }

      // Find meetings that should have ended
      const endedMeetings = await this.meetingRepository.find({
        where: {
          scheduledEnd: Between(fiveMinutesAgo, now),
          status: MeetingStatus.IN_PROGRESS,
        },
      });

      for (const meeting of endedMeetings) {
        // Check if room is still active
        if (meeting.meetingRoomId) {
          const isActive = await this.videoIntegrationService.isRoomActive(
            meeting.meetingRoomId,
          );

          if (!isActive) {
            // Auto-complete if room is no longer active
            meeting.status = MeetingStatus.COMPLETED;
            meeting.actualEnd = new Date();
            await this.meetingRepository.save(meeting);
            this.logger.log(`Auto-completed meeting ${meeting.id}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to auto-transition meetings:', error);
    }
  }

  /**
   * Private helper methods
   */
  private async validateTimeSlotAvailability(
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

  private async handleMeetingTypeChange(
    meeting: ScheduledMeeting,
    newType: MeetingType,
  ): Promise<void> {
    const needsRoom =
      newType === MeetingType.VIDEO_CALL || newType === MeetingType.AUDIO_ONLY;
    const hadRoom = !!meeting.meetingRoomId;

    if (needsRoom && !hadRoom) {
      // Create new room
      try {
        await this.ensureVideoRoom(meeting.id);
      } catch (error) {
        this.logger.error(`Failed to create room on type change: ${error.message}`);
      }
    } else if (!needsRoom && hadRoom) {
      // End existing room
      try {
        await this.videoIntegrationService.endRoom(
          meeting.meetingRoomId!,
          meeting.counselorId,
        );
        meeting.meetingRoomId = " ";
        meeting.meetingRoomUrl = " ";
        meeting.meetingRoomPassword = " ";
        await this.meetingRepository.save(meeting);
      } catch (error) {
        this.logger.error(`Failed to end room on type change: ${error.message}`);
      }
    }
  }

  private canJoinMeeting(meeting: ScheduledMeeting): boolean {
    const now = new Date();
    const startTime = new Date(meeting.scheduledStart);
    const endTime = new Date(meeting.scheduledEnd);
    const bufferBefore = 15 * 60000; // 15 minutes

    return (
      now >= new Date(startTime.getTime() - bufferBefore) &&
      now <= endTime &&
      meeting.status !== MeetingStatus.CANCELLED &&
      meeting.status !== MeetingStatus.COMPLETED
    );
  }

  private async sendMeetingCreatedNotifications(
    meeting: ScheduledMeeting,
  ): Promise<void> {
    const userName = `${meeting.user?.firstName} ${meeting.user?.lastName}`;
    const counselorName = `${meeting.counselor?.firstName} ${meeting.counselor?.lastName}`;

    await this.notificationService.sendAppointmentConfirmation({
      userId: meeting.userId,
      counselorId: meeting.counselorId,
      appointmentId: meeting.id,
      appointmentDate: meeting.scheduledStart.toISOString().split('T')[0],
      appointmentTime: meeting.scheduledStart.toTimeString().slice(0, 5),
      userName,
      counselorName,
    });
  }

  private async sendRescheduledNotifications(
    meeting: ScheduledMeeting,
  ): Promise<void> {
    // Implement rescheduling notifications
    this.logger.log(`Would send rescheduled notification for meeting ${meeting.id}`);
  }

  private async sendCancellationNotifications(
    meeting: ScheduledMeeting,
  ): Promise<void> {
    const userName = `${meeting.user?.firstName} ${meeting.user?.lastName}`;
    const counselorName = `${meeting.counselor?.firstName} ${meeting.counselor?.lastName}`;

    await this.notificationService.sendAppointmentCancellation({
      userId: meeting.userId,
      counselorId: meeting.counselorId,
      appointmentId: meeting.id,
      appointmentDate: meeting.scheduledStart.toISOString().split('T')[0],
      appointmentTime: meeting.scheduledStart.toTimeString().slice(0, 5),
      userName,
      counselorName,
      reason: meeting.cancellationReason,
      cancelledBy: meeting.cancelledBy === meeting.userId ? 'user' : 'counselor',
    });
  }
}