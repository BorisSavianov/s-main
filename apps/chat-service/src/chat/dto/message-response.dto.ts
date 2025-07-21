// apps/chat-service/src/chat/dto/message-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SenderType } from '../entities/chat-message.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';

export class MessageResponseDto {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({ description: 'Session ID' })
  sessionId: string;

  @ApiPropertyOptional({ description: 'Sender ID' })
  senderId?: string | null;

  @ApiProperty({ description: 'Sender type', enum: SenderType })
  senderType: SenderType;

  @ApiProperty({ description: 'Message content' })
  content: string;

  @ApiProperty({ description: 'Content type' })
  contentType: string;

  @ApiPropertyOptional({ description: 'Sentiment score' })
  sentimentScore?: number | null;

  @ApiProperty({ description: 'Is message flagged' })
  isFlagged: boolean;

  @ApiPropertyOptional({ description: 'Flag reason' })
  flagReason?: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Message attachments',
    type: [MessageAttachment],
  })
  attachments?: MessageAttachment[];
}
