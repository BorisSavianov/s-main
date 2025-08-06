// apps/notification-service/src/notifications/dto/schedule-notification.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { SendNotificationDto } from './send-notification.dto';

export class ScheduleNotificationDto extends SendNotificationDto {
  @ApiProperty({ description: 'Date and time to send the notification' })
  @IsDateString()
  declare scheduledFor: Date;
}
