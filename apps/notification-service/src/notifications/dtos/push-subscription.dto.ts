// apps/notification-service/src/notifications/dto/push-subscription.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreatePushSubscriptionDto {
  @ApiProperty({ description: 'Push notification endpoint' })
  @IsString()
  endpoint: string;

  @ApiProperty({ description: 'P256DH key for encryption' })
  @IsString()
  p256dhKey: string;

  @ApiProperty({ description: 'Auth key for encryption' })
  @IsString()
  authKey: string;

  @ApiPropertyOptional({ description: 'User agent string' })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
