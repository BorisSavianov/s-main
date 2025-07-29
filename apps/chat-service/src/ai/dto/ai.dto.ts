// apps/chat-service/src/ai/dto/ai.dto.ts
import {
  IsString,
  IsUUID,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// DTO Classes for better Swagger documentation
export class RecentMessageDto {
  @ApiProperty({
    description: 'Type of message sender',
    example: 'user',
    enum: ['user', 'ai', 'system'],
  })
  @IsString()
  senderType: string;

  @ApiProperty({
    description: 'Message content',
    example: 'I have been feeling anxious lately',
    maxLength: 2000,
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Message creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  @IsDate()
  @Type(() => Date)
  createdAt: Date;
}

export class GenerateResponseDto {
  @ApiProperty({
    description: 'Unique session identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    description: 'Current user message to process',
    example: 'I have been struggling with sleep issues',
    maxLength: 2000,
  })
  @IsString()
  userMessage: string;

  @ApiProperty({
    description: 'Recent conversation messages for context',
    type: [RecentMessageDto],
    maxItems: 20,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecentMessageDto)
  recentMessages: RecentMessageDto[];
}

export class SentimentAnalysisDto {
  @ApiProperty({
    description: 'Text to analyze for sentiment',
    example: 'I feel really happy today!',
    maxLength: 1000,
  })
  @IsString()
  text: string;
}

export class SessionMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: 'How are you feeling today?',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Message sender type',
    example: 'user',
    enum: ['user', 'ai'],
  })
  @IsString()
  senderType: string;
}

export class SessionSummaryDto {
  @ApiProperty({
    description: 'Array of messages to summarize',
    type: [SessionMessageDto],
    maxItems: 100,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionMessageDto)
  messages: SessionMessageDto[];
}

export class ContentModerationDto {
  @ApiProperty({
    description: 'Content to moderate for harmful material',
    example: 'This seems like a normal message',
    maxLength: 2000,
  })
  @IsString()
  content: string;
}

export class SemanticSearchDto {
  @ApiProperty({
    description: 'Search query for finding similar messages',
    example: 'anxiety coping strategies',
    maxLength: 500,
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'Session ID to search within',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    description: 'Maximum number of results to return',
    example: 5,
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiProperty({
    description: 'Similarity threshold (0.0-1.0)',
    example: 0.7,
    minimum: 0.0,
    maximum: 1.0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(1.0)
  threshold?: number;
}

export class EmbeddingDto {
  @ApiProperty({
    description: 'Text to generate embedding for',
    example: 'I need help with managing stress',
    maxLength: 1000,
  })
  @IsString()
  text: string;
}

// Response DTOs
export class AIResponseDto {
  @ApiProperty({
    description: 'Generated AI response content',
    example:
      "I understand that you're dealing with anxiety. It's important to remember that you're not alone in this.",
  })
  content: string;

  @ApiProperty({
    description: 'Additional metadata about the response',
    example: { model: 'llama3.2:3b', processing_time: 1250 },
    required: false,
  })
  metadata?: Record<string, any>;
}

export class SentimentResponseDto {
  @ApiProperty({
    description: 'Sentiment score from -1.0 (negative) to 1.0 (positive)',
    example: 0.75,
    minimum: -1.0,
    maximum: 1.0,
  })
  sentiment: number;
}

export class SummaryResponseDto {
  @ApiProperty({
    description: 'Generated session summary',
    example:
      'The user discussed feelings of anxiety and stress management techniques. The conversation focused on coping strategies and professional support options.',
  })
  summary: string;
}

export class ModerationResponseDto {
  @ApiProperty({
    description: 'Whether content should be flagged',
    example: false,
  })
  shouldFlag: boolean;

  @ApiProperty({
    description: 'Reason for flagging if applicable',
    example: 'Contains expressions of self-harm',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description: 'Confidence score of the moderation decision',
    example: 0.85,
    minimum: 0.0,
    maximum: 1.0,
    required: false,
  })
  confidence?: number;
}

export class SemanticSearchResultDto {
  @ApiProperty({
    description: 'Message content',
    example: 'I was talking about anxiety earlier',
  })
  content: string;

  @ApiProperty({
    description: 'Similarity score',
    example: 0.85,
    minimum: 0.0,
    maximum: 1.0,
  })
  similarity: number;

  @ApiProperty({
    description: 'Message creation date',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;
}

export class SemanticSearchResponseDto {
  @ApiProperty({
    description: 'Array of similar messages found',
    type: [SemanticSearchResultDto],
  })
  results: SemanticSearchResultDto[];

  @ApiProperty({
    description: 'Number of results returned',
    example: 3,
  })
  count: number;
}

export class EmbeddingResponseDto {
  @ApiProperty({
    description: 'Generated embedding vector',
    example: [0.123, -0.456, 0.789],
    type: [Number],
  })
  embedding: number[];

  @ApiProperty({
    description: 'Number of dimensions in the embedding',
    example: 768,
  })
  dimensions: number;

  @ApiProperty({
    description: 'Model used for embedding generation',
    example: 'nomic-embed-text',
  })
  model: string;
}

export class EmbeddingStatsResponseDto {
  @ApiProperty({
    description: 'Total number of embeddings for the session',
    example: 25,
  })
  totalEmbeddings: number;

  @ApiProperty({
    description: 'Average similarity score across embeddings',
    example: 0.75,
    minimum: 0.0,
    maximum: 1.0,
  })
  averageSimilarity: number;

  @ApiProperty({
    description: 'Percentage of messages with embeddings',
    example: 85.5,
    minimum: 0.0,
    maximum: 100.0,
  })
  embeddingCoverage: number;

  @ApiProperty({
    description: 'Date when last embedding was generated',
    example: '2024-01-15T10:30:00.000Z',
    nullable: true,
  })
  lastGenerated: Date | null;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Service health status',
    example: 'healthy',
    enum: ['healthy', 'unhealthy'],
  })
  status: string;

  @ApiProperty({
    description: 'Error message if unhealthy',
    example: 'Connection to Ollama failed',
    required: false,
  })
  error?: string;
}

export class ApiResponseDto<T> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response data',
  })
  data: T;

  @ApiProperty({
    description: 'Response timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  timestamp: string;
}
