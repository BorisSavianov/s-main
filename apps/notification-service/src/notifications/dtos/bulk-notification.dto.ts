// apps/notification-service/src/notifications/dto/bulk-notification.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsString,
  IsOptional,
  IsObject,
  IsDateString,
} from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class BulkNotificationDto {
  @ApiProperty({
    description: 'Array of user IDs to send notifications to',
    type: [String],
  })
  @IsUUID('4', { each: true })
  userIds: string[];

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
    description: 'Schedule notifications for future delivery',
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: Date;
}
