// apps/chat-service/src/chat/dto/query-messages.dto.ts
import {
  IsOptional,
  IsUUID,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SenderType } from '../entities/chat-message.entity';

export class QueryMessagesDto {
  @ApiPropertyOptional({ description: 'Session ID to filter messages' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Sender ID to filter messages' })
  @IsOptional()
  @IsUUID()
  senderId?: string;

  @ApiPropertyOptional({
    description: 'Sender type to filter messages',
    enum: SenderType,
  })
  @IsOptional()
  @IsEnum(SenderType)
  senderType?: SenderType;

  @ApiPropertyOptional({ description: 'Messages created after this date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Messages created before this date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Include flagged messages only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  flaggedOnly?: boolean;
}
