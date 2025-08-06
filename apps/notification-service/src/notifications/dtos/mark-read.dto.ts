// apps/notification-service/src/notifications/dto/mark-read.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class MarkReadDto {
  @ApiPropertyOptional({
    description: 'Specific notification ID to mark as read',
  })
  @IsOptional()
  @IsUUID()
  notificationId?: string;

  @ApiPropertyOptional({
    description: 'Mark all notifications as read',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  markAll?: boolean;
}
