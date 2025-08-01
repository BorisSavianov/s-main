// src/scheduling/guards/meeting-access.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledMeeting } from '../entities/scheduled-meeting.entity';

@Injectable()
export class MeetingAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(ScheduledMeeting)
    private meetingRepository: Repository<ScheduledMeeting>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const meetingId = request.params.id;

    if (!meetingId || !user) {
      throw new ForbiddenException('Access denied');
    }

    const meeting = await this.meetingRepository.findOne({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new ForbiddenException('Meeting not found');
    }

    // Check if user is either the client or the counselor
    if (meeting.userId !== user.id && meeting.counselorId !== user.id) {
      throw new ForbiddenException('You do not have access to this meeting');
    }

    return true;
  }
}
