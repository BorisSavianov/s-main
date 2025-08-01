// src/scheduling/dto/create-meeting.dto.ts
import {
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MeetingType,
  RecurringPattern,
} from '../entities/scheduled-meeting.entity';

export class CreateMeetingDto {
  @IsNotEmpty()
  @IsString()
  counselorId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MeetingType)
  meetingType?: MeetingType;

  @IsNotEmpty()
  @IsDateString()
  scheduledStart: string;

  @IsNotEmpty()
  @IsDateString()
  scheduledEnd: string;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  bufferBeforeMinutes?: number;

  @IsOptional()
  @IsNumber()
  bufferAfterMinutes?: number;

  @IsOptional()
  @IsBoolean()
  confirmationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(RecurringPattern)
  recurringPattern?: RecurringPattern;

  @IsOptional()
  @IsNumber()
  recurringInterval?: number;

  @IsOptional()
  @IsDateString()
  recurringUntil?: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsString()
  locationAddress?: string;

  @IsOptional()
  @IsString()
  locationRoom?: string;

  @IsOptional()
  @IsString()
  preparationNotes?: string;
}
