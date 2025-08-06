// apps/notification-service/src/notifications/dto/send-notification.dto.ts
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  IsDateString,
  IsUUID,
  IsDate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../entities/notification.entity';

export class SendNotificationDto {
  @ApiProperty({ description: 'User ID to send notification to' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: NotificationType, description: 'Type of notification' })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification message' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Additional data payload' })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Notification category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Schedule notification for future delivery',
  })
  @IsOptional()
  @IsDate()
  scheduledFor?: Date;

  @ApiPropertyOptional({
    description: 'Send immediately regardless of schedule',
  })
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;
}
