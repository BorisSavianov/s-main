// apps/chat-service/src/ai/types/ai.types.ts
import { ApiProperty } from '@nestjs/swagger';

export interface ChatContext {
  sessionId: string;
  recentMessages: Array<{
    senderType: string;
    content: string;
    createdAt: Date;
  }>;
  userMessage: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface AIResponse {
  content: string;
  sentiment?: number;
  confidence?: number;
  topics?: string[];
  flags?: ContentFlag[];
  recommendations?: string[];
}

export interface ContentFlag {
  type: 'crisis' | 'inappropriate' | 'spam' | 'abusive';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  confidence: number;
}

// Swagger-compatible classes for documentation
export class ChatContextDto {
  @ApiProperty({
    description: 'Unique session identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Array of recent conversation messages',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        senderType: {
          type: 'string',
          example: 'user',
          enum: ['user', 'ai', 'system'],
        },
        content: {
          type: 'string',
          example: 'I have been feeling anxious lately',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          example: '2024-01-15T10:30:00.000Z',
        },
      },
    },
  })
  recentMessages: Array<{
    senderType: string;
    content: string;
    createdAt: Date;
  }>;

  @ApiProperty({
    description: 'Current user message',
    example: 'I need help managing my stress levels',
  })
  userMessage: string;

  @ApiProperty({
    description: 'Optional user identifier',
    example: '456e7890-e12c-34d5-a678-901234567890',
    required: false,
  })
  userId?: string;

  @ApiProperty({
    description: 'Additional context metadata',
    example: { source: 'web', userAgent: 'Mozilla/5.0...' },
    required: false,
  })
  metadata?: Record<string, any>;
}

export class AIResponseDto {
  @ApiProperty({
    description: 'Generated AI response content',
    example:
      'I understand that stress can be overwhelming. Here are some strategies that might help...',
  })
  content: string;

  @ApiProperty({
    description: 'Sentiment score of the user message (-1.0 to 1.0)',
    example: -0.2,
    minimum: -1.0,
    maximum: 1.0,
    required: false,
  })
  sentiment?: number;

  @ApiProperty({
    description: 'Confidence score of the AI response (0.0 to 1.0)',
    example: 0.85,
    minimum: 0.0,
    maximum: 1.0,
    required: false,
  })
  confidence?: number;

  @ApiProperty({
    description: 'Key topics identified in the conversation',
    example: ['stress', 'anxiety', 'coping strategies'],
    type: [String],
    required: false,
  })
  topics?: string[];

  @ApiProperty({
    description: 'Content flags if any concerning content detected',
    type: [Object],
    required: false,
  })
  flags?: ContentFlag[];

  @ApiProperty({
    description: 'Therapeutic recommendations based on the conversation',
    example: [
      'Practice deep breathing exercises',
      'Consider professional counseling',
    ],
    type: [String],
    required: false,
  })
  recommendations?: string[];
}

export class ContentFlagDto {
  @ApiProperty({
    description: 'Type of content flag',
    example: 'crisis',
    enum: ['crisis', 'inappropriate', 'spam', 'abusive'],
  })
  type: 'crisis' | 'inappropriate' | 'spam' | 'abusive';

  @ApiProperty({
    description: 'Severity level of the flagged content',
    example: 'high',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  severity: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({
    description: 'Reason for flagging the content',
    example: 'Contains expressions of self-harm',
  })
  reason: string;

  @ApiProperty({
    description: 'Confidence score of the flag decision',
    example: 0.92,
    minimum: 0.0,
    maximum: 1.0,
  })
  confidence: number;
}

// Additional types for extended functionality
export interface SessionAnalytics {
  sessionId: string;
  totalMessages: number;
  averageSentiment: number;
  keyTopics: string[];
  riskFactors: string[];
  engagementLevel: 'low' | 'medium' | 'high';
  sessionDuration: number; // in minutes
  lastActivity: Date;
}

export class SessionAnalyticsDto {
  @ApiProperty({
    description: 'Session identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Total number of messages in the session',
    example: 15,
  })
  totalMessages: number;

  @ApiProperty({
    description: 'Average sentiment across all messages',
    example: 0.3,
    minimum: -1.0,
    maximum: 1.0,
  })
  averageSentiment: number;

  @ApiProperty({
    description: 'Key topics discussed in the session',
    example: ['anxiety', 'work stress', 'sleep issues'],
    type: [String],
  })
  keyTopics: string[];

  @ApiProperty({
    description: 'Identified risk factors',
    example: ['sleep deprivation', 'social isolation'],
    type: [String],
  })
  riskFactors: string[];

  @ApiProperty({
    description: 'User engagement level in the session',
    example: 'high',
    enum: ['low', 'medium', 'high'],
  })
  engagementLevel: 'low' | 'medium' | 'high';

  @ApiProperty({
    description: 'Session duration in minutes',
    example: 45,
  })
  sessionDuration: number;

  @ApiProperty({
    description: 'Last activity timestamp',
    example: '2024-01-15T11:15:00.000Z',
  })
  lastActivity: Date;
}

export interface EmbeddingMetrics {
  sessionId: string;
  totalEmbeddings: number;
  averageSimilarity: number;
  clusterCount: number;
  embeddingModel: string;
  lastUpdated: Date;
}
