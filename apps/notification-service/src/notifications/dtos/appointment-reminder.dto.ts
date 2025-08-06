// apps/notification-service/src/notifications/dto/appointment-reminder.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class AppointmentReminderDto {
  @ApiProperty({ description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Counselor ID' })
  @IsUUID()
  counselorId: string;

  @ApiProperty({ description: 'Appointment ID' })
  @IsUUID()
  appointmentId: string;

  @ApiProperty({ description: 'Appointment date (YYYY-MM-DD)' })
  @IsString()
  appointmentDate: string;

  @ApiProperty({ description: 'Appointment time (HH:MM)' })
  @IsString()
  appointmentTime: string;

  @ApiProperty({ description: 'Counselor name' })
  @IsString()
  counselorName: string;

  @ApiProperty({ description: 'User name' })
  @IsString()
  userName: string;

  @ApiPropertyOptional({
    enum: NotificationType,
    description: 'Reminder type',
    default: NotificationType.EMAIL,
  })
  @IsOptional()
  @IsEnum(NotificationType)
  reminderType?: NotificationType;

  @ApiPropertyOptional({ description: 'Minutes before appointment' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minutesBefore?: number;
}
