// src/scheduling/dto/update-preferences.dto.ts
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
  @IsOptional()
  @IsEnum(MeetingType)
  preferredMeetingType?: MeetingType;

  @IsOptional()
  @IsNumber()
  preferredDurationMinutes?: number;

  @IsOptional()
  @IsNumber()
  preferredBufferMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enableReminders?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  reminderTimes?: number[];

  @IsOptional()
  @IsArray()
  @IsEnum(ReminderType, { each: true })
  preferredReminderTypes?: ReminderType[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  earliestTime?: string;

  @IsOptional()
  @IsString()
  latestTime?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  availableDays?: number[];

  @IsOptional()
  @IsBoolean()
  requireCounselorConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  allowLastMinuteBooking?: boolean;

  @IsOptional()
  @IsNumber()
  minimumAdvanceHours?: number;

  @IsOptional()
  @IsNumber()
  maximumAdvanceDays?: number;

  @IsOptional()
  @IsBoolean()
  allowCancellation?: boolean;

  @IsOptional()
  @IsNumber()
  cancellationDeadlineHours?: number;

  @IsOptional()
  @IsBoolean()
  allowRescheduling?: boolean;

  @IsOptional()
  @IsNumber()
  maxReschedules?: number;
}
