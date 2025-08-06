// apps/notification-service/src/preferences/dtos/update-preferences.dto.ts
import {
  IsArray,
  IsOptional,
  IsString,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class NotificationPreferenceDto {
  @ApiProperty({ description: 'Notification category' })
  @IsString()
  notificationCategory: string;

  @ApiProperty({ description: 'Enable email notifications', required: false })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiProperty({ description: 'Enable SMS notifications', required: false })
  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @ApiProperty({ description: 'Enable push notifications', required: false })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiProperty({ description: 'Enable in-app notifications', required: false })
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiProperty({ description: 'Notification frequency', required: false })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiProperty({
    description: 'Quiet hours start time (HH:MM)',
    required: false,
  })
  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @ApiProperty({ description: 'Quiet hours end time (HH:MM)', required: false })
  @IsOptional()
  @IsString()
  quietHoursEnd?: string;
}

export class UpdatePreferencesDto {
  @ApiProperty({
    description: 'Array of notification preferences to update',
    type: [NotificationPreferenceDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  preferences: NotificationPreferenceDto[];
}
