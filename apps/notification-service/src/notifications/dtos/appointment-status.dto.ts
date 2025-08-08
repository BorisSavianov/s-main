// apps/notification-service/src/notifications/dto/appointment-status.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional } from 'class-validator';

export class AppointmentStatusDto {
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

  @ApiPropertyOptional({ description: 'Cancellation reason' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Who cancelled the appointment',
    enum: ['user', 'counselor'],
  })
  @IsOptional()
  @IsString()
  cancelledBy: 'user' | 'counselor';

  @ApiProperty({ description: 'User email' })
  @IsString()
  userEmail: string;

  @ApiProperty({ description: 'Counselor email' })
  @IsString()
  counselorEmail: string;
}
