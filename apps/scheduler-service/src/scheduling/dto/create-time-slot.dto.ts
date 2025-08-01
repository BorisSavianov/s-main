import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { RecurringPattern } from '../entities/scheduled-meeting.entity';

// src/scheduling/dto/create-time-slot.dto.ts
export class CreateTimeSlotDto {
  @IsNotEmpty()
  @IsDateString()
  slotDate: string;

  @IsNotEmpty()
  @IsString()
  startTime: string;

  @IsNotEmpty()
  @IsString()
  endTime: string;

  @IsOptional()
  @IsNumber()
  slotDurationMinutes?: number;

  @IsOptional()
  @IsNumber()
  bufferMinutes?: number;

  @IsOptional()
  @IsNumber()
  maxBookings?: number;

  @IsOptional()
  @IsNumber()
  customRate?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(RecurringPattern)
  recurringPattern?: RecurringPattern;

  @IsOptional()
  @IsDateString()
  recurringUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
