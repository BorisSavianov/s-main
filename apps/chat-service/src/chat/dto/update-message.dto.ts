// apps/chat-service/src/chat/dto/update-message.dto.ts
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMessageDto {
  @ApiPropertyOptional({
    description: 'Updated message content',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({ description: 'Flag status' })
  @IsOptional()
  @IsBoolean()
  isFlagged?: boolean;

  @ApiPropertyOptional({ description: 'Reason for flagging', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  flagReason?: string;

  @ApiPropertyOptional({ description: 'Sentiment score (-1 to 1)' })
  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  sentimentScore?: number;
}
