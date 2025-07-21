// apps/chat-service/src/chat/dto/create-session.dto.ts
import {
  IsOptional,
  IsUUID,
  IsBoolean,
  IsString,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SessionType {
  ANONYMOUS = 'anonymous',
  AUTHENTICATED = 'authenticated',
  COUNSELOR_ASSISTED = 'counselor_assisted',
}

export class CreateSessionDto {
  @ApiPropertyOptional({ description: 'User ID for authenticated sessions' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Counselor ID for assisted sessions' })
  @IsOptional()
  @IsUUID()
  counselorId?: string;

  @ApiProperty({
    description: 'Session type',
    enum: SessionType,
    default: SessionType.ANONYMOUS,
  })
  @IsEnum(SessionType)
  sessionType: SessionType = SessionType.ANONYMOUS;

  @ApiPropertyOptional({
    description: 'Custom session token (auto-generated if not provided)',
  })
  @IsOptional()
  @IsString()
  sessionToken?: string;
}
