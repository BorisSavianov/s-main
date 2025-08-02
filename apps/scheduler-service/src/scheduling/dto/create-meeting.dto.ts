// src/scheduling/dto/create-meeting.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsString,
} from 'class-validator';
import {
  MeetingType,
  RecurringPattern,
} from '../entities/scheduled-meeting.entity';

export class CreateMeetingDto {
  @ApiProperty({ description: 'UUID of the counselor' })
  @IsNotEmpty()
  @IsString()
  counselorId: string;

  @ApiPropertyOptional({
    description: 'Title of the meeting',
    example: 'Weekly sync',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description',
    example: 'Discuss progress & blockers',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: MeetingType, description: 'Type of meeting' })
  @IsOptional()
  @IsEnum(MeetingType)
  meetingType?: MeetingType;

  @ApiProperty({
    description: 'ISO date-time for start',
    example: '2025-08-10T10:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  scheduledStart: string;

  @ApiProperty({
    description: 'ISO date-time for end',
    example: '2025-08-10T11:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  scheduledEnd: string;

  @ApiPropertyOptional({ description: 'Duration in minutes', example: 60 })
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Buffer before in minutes', example: 10 })
  @IsOptional()
  @IsNumber()
  bufferBeforeMinutes?: number;

  @ApiPropertyOptional({ description: 'Buffer after in minutes', example: 5 })
  @IsOptional()
  @IsNumber()
  bufferAfterMinutes?: number;

  @ApiPropertyOptional({ description: 'Require confirmation', example: true })
  @IsOptional()
  @IsBoolean()
  confirmationRequired?: boolean;

  @ApiPropertyOptional({ description: 'Is recurring series', example: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    enum: RecurringPattern,
    description: 'Recurrence pattern',
  })
  @IsOptional()
  @IsEnum(RecurringPattern)
  recurringPattern?: RecurringPattern;

  @ApiPropertyOptional({ description: 'Recurrence interval', example: 1 })
  @IsOptional()
  @IsNumber()
  recurringInterval?: number;

  @ApiPropertyOptional({
    description: 'Recurrence end date',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  recurringUntil?: string;

  @ApiPropertyOptional({
    description: 'Location name',
    example: 'Conference Room A',
  })
  @IsOptional()
  @IsString()
  locationName?: string;

  @ApiPropertyOptional({
    description: 'Location address',
    example: '123 Main St',
  })
  @IsOptional()
  @IsString()
  locationAddress?: string;

  @ApiPropertyOptional({
    description: 'Room within location',
    example: 'Room 101',
  })
  @IsOptional()
  @IsString()
  locationRoom?: string;

  @ApiPropertyOptional({
    description: 'Preparation notes',
    example: 'Send agenda 24h before',
  })
  @IsOptional()
  @IsString()
  preparationNotes?: string;
}
