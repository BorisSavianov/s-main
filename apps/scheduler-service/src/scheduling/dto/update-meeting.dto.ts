// src/scheduling/dto/update-meeting.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { CreateMeetingDto } from './create-meeting.dto';
import { MeetingStatus } from '../entities/scheduled-meeting.entity';
import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';

export class UpdateMeetingDto extends PartialType(CreateMeetingDto) {
  @ApiPropertyOptional({
    enum: MeetingStatus,
    description: 'New meeting status',
  })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional({
    description: 'Session notes',
    example: 'Client was on time.',
  })
  @IsOptional()
  @IsString()
  sessionNotes?: string;

  @ApiPropertyOptional({
    description: 'Session summary',
    example: 'Covered module 3 and 4.',
  })
  @IsOptional()
  @IsString()
  sessionSummary?: string;

  @ApiPropertyOptional({
    description: 'Reason for cancellation',
    example: 'Client requested reschedule.',
  })
  @IsOptional()
  @IsString()
  cancellationReason?: string;

  @ApiPropertyOptional({
    description: 'Actual start time (ISO)',
    example: '2025-08-10T10:05:00Z',
  })
  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @ApiPropertyOptional({
    description: 'Actual end time (ISO)',
    example: '2025-08-10T11:02:00Z',
  })
  @IsOptional()
  @IsDateString()
  actualEnd?: string;
}
