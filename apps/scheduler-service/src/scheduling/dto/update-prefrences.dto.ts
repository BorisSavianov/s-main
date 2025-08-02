// src/scheduling/dto/update-preferences.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsString,
  IsArray,
} from 'class-validator';
import { MeetingType } from '../entities/scheduled-meeting.entity';
import { ReminderType } from '../entities/meeting-reminder.entity';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    enum: MeetingType,
    description: 'Preferred meeting type',
  })
  @IsOptional()
  @IsEnum(MeetingType)
  preferredMeetingType?: MeetingType;

  @ApiPropertyOptional({
    description: 'Preferred meeting duration in minutes',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  preferredDurationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Preferred buffer before/after in minutes',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  preferredBufferMinutes?: number;

  @ApiPropertyOptional({
    description: 'Enable meeting reminders',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableReminders?: boolean;

  @ApiPropertyOptional({
    description: 'Reminder times before meeting in minutes',
    example: [60, 15],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  reminderTimes?: number[];

  @ApiPropertyOptional({
    enum: ReminderType,
    isArray: true,
    description: 'Types of reminders to send',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ReminderType, { each: true })
  preferredReminderTypes?: ReminderType[];

  @ApiPropertyOptional({
    description: 'User timezone',
    example: 'Europe/Sofia',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Earliest booking time (HH:mm)',
    example: '08:00',
  })
  @IsOptional()
  @IsString()
  earliestTime?: string;

  @ApiPropertyOptional({
    description: 'Latest booking time (HH:mm)',
    example: '17:00',
  })
  @IsOptional()
  @IsString()
  latestTime?: string;

  @ApiPropertyOptional({
    description: 'Allowed booking days (0=Sunday…6=Saturday)',
    example: [1, 2, 3, 4, 5],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  availableDays?: number[];

  @ApiPropertyOptional({
    description: 'Require counselor confirmation before booking',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  requireCounselorConfirmation?: boolean;

  @ApiPropertyOptional({
    description: 'Allow last-minute bookings',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowLastMinuteBooking?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum hours in advance for booking',
    example: 24,
  })
  @IsOptional()
  @IsNumber()
  minimumAdvanceHours?: number;

  @ApiPropertyOptional({
    description: 'Maximum days in advance for booking',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  maximumAdvanceDays?: number;

  @ApiPropertyOptional({
    description: 'Allow users to cancel meetings',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowCancellation?: boolean;

  @ApiPropertyOptional({
    description: 'Cancellation deadline in hours before meeting',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  cancellationDeadlineHours?: number;

  @ApiPropertyOptional({
    description: 'Allow rescheduling of meetings',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowRescheduling?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of reschedules allowed',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  maxReschedules?: number;
}
