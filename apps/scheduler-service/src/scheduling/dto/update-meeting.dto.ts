// src/scheduling/dto/update-meeting.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
import { CreateMeetingDto } from './create-meeting.dto';
import { MeetingStatus } from '../entities/scheduled-meeting.entity';

export class UpdateMeetingDto extends PartialType(CreateMeetingDto) {
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @IsOptional()
  @IsString()
  sessionNotes?: string;

  @IsOptional()
  @IsString()
  sessionSummary?: string;

  @IsOptional()
  @IsString()
  cancellationReason?: string;

  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @IsOptional()
  @IsDateString()
  actualEnd?: string;
}
