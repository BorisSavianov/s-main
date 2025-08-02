// src/scheduling/dto/create-time-slot.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsDateString,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { RecurringPattern } from '../entities/scheduled-meeting.entity';

export class CreateTimeSlotDto {
  @ApiProperty({ description: 'Date of the slot (ISO)', example: '2025-08-15' })
  @IsNotEmpty()
  @IsDateString()
  slotDate: string;

  @ApiProperty({ description: 'Start time (HH:mm)', example: '09:00' })
  @IsNotEmpty()
  @IsString()
  startTime: string;

  @ApiProperty({ description: 'End time (HH:mm)', example: '12:00' })
  @IsNotEmpty()
  @IsString()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Duration per booking in minutes',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  slotDurationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Buffer between bookings in minutes',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  bufferMinutes?: number;

  @ApiPropertyOptional({ description: 'Max simultaneous bookings', example: 1 })
  @IsOptional()
  @IsNumber()
  maxBookings?: number;

  @ApiPropertyOptional({ description: 'Custom rate for slot', example: 100 })
  @IsOptional()
  @IsNumber()
  customRate?: number;

  @ApiPropertyOptional({ description: 'Recurring slot', example: false })
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

  @ApiPropertyOptional({
    description: 'Recurrence end date (ISO)',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  recurringUntil?: string;

  @ApiPropertyOptional({
    description: 'Public notes',
    example: 'Available for general consults',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Internal notes (counselor only)' })
  @IsOptional()
  @IsString()
  internalNotes?: string;
}
