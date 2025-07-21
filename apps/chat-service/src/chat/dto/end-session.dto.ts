// apps/chat-service/src/chat/dto/end-session.dto.ts
import {
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EndSessionDto {
  @ApiProperty({ description: 'Session ID to end' })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({
    description: 'Optional closing summary',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  closingSummary?: string;

  @ApiPropertyOptional({ description: 'Session tags for categorization' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
