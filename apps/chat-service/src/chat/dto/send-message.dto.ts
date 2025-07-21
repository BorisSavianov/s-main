// apps/chat-service/src/chat/dto/send-message.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SenderType } from '../entities/chat-message.entity';

export class SendMessageDto {
  @ApiProperty({ description: 'Chat session ID' })
  @IsNotEmpty()
  @IsUUID()
  sessionId: string;

  @ApiProperty({ description: 'Message content', maxLength: 4000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(4000, { message: 'Message content cannot exceed 4000 characters' })
  content: string;

  @ApiProperty({
    description: 'Type of sender',
    enum: SenderType,
    default: SenderType.USER,
  })
  @IsEnum(SenderType)
  senderType: SenderType = SenderType.USER;

  @ApiPropertyOptional({
    description: 'Sender user ID (required for user messages)',
  })
  @IsOptional()
  @IsUUID()
  senderId?: string;

  @ApiPropertyOptional({ description: 'Content type', default: 'text' })
  @IsOptional()
  @IsString()
  contentType?: string = 'text';

  @ApiPropertyOptional({ description: 'Message metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'File attachment IDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
