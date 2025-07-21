// apps/chat-service/src/chat/dto/session-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMessage } from '../entities/chat-message.entity';

export class SessionResponseDto {
  @ApiProperty({ description: 'Session ID' })
  id: string;

  @ApiPropertyOptional({ description: 'User ID' })
  userId?: string | null;

  @ApiPropertyOptional({ description: 'Counselor ID' })
  counselorId?: string | null;

  @ApiProperty({ description: 'Session token' })
  sessionToken: string;

  @ApiProperty({ description: 'Is anonymous session' })
  isAnonymous: boolean;

  @ApiProperty({ description: 'Is session active' })
  isActive: boolean;

  @ApiProperty({ description: 'Session start time' })
  startedAt: Date;

  @ApiPropertyOptional({ description: 'Session end time' })
  endedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Session summary' })
  summary?: string | null;

  @ApiPropertyOptional({ description: 'Overall sentiment score' })
  overallSentiment?: number | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Recent messages', type: [ChatMessage] })
  messages?: ChatMessage[];
}
