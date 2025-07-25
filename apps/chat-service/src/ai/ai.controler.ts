// apps/chat-service/src/ai/ai.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpStatus,
  HttpCode,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiProperty,
  getSchemaPath,
} from '@nestjs/swagger';
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

import { AIService } from './ai.service';

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

@Controller('ai')
@ApiTags('AI Service')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('generate-response')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate AI response to user message',
    description:
      'Generates a contextual AI response based on the user message and conversation history. The AI provides supportive mental health assistance while maintaining appropriate boundaries.',
  })
  @ApiBody({
    type: GenerateResponseDto,
    description:
      'Chat context including session ID, user message, and recent conversation history',
  })
  @ApiResponse({
    status: 200,
    description: 'AI response generated successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(AIResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid request data - missing required fields or invalid format',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - AI service unavailable',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'string',
          example: 'AI service temporarily unavailable',
        },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
      },
    },
  })
  async generateResponse(
    @Body() request: GenerateResponseDto,
  ): Promise<ApiResponseDto<AIResponseDto>> {
    try {
      const context = {
        sessionId: request.sessionId,
        recentMessages: request.recentMessages,
        userMessage: request.userMessage,
      };

      const response = await this.aiService.generateResponse(context);

      return {
        success: true,
        data: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new InternalServerErrorException({
        success: false,
        error: 'Failed to generate AI response',
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Post('analyze-sentiment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analyze sentiment of text',
    description:
      'Analyzes the emotional sentiment of provided text, returning a score from -1.0 (very negative) to 1.0 (very positive).',
  })
  @ApiBody({
    type: SentimentAnalysisDto,
    description: 'Text content to analyze for emotional sentiment',
  })
  @ApiResponse({
    status: 200,
    description: 'Sentiment analysis completed successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(SentimentResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data - text is required',
  })
  async analyzeSentiment(
    @Body() request: SentimentAnalysisDto,
  ): Promise<ApiResponseDto<SentimentResponseDto>> {
    if (!request.text?.trim()) {
      throw new BadRequestException('Text is required for sentiment analysis');
    }

    const sentiment = await this.aiService.analyzeSentiment(request.text);

    return {
      success: true,
      data: { sentiment },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('generate-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate session summary',
    description:
      'Creates a comprehensive summary of a conversation session, highlighting key themes and important points discussed.',
  })
  @ApiBody({
    type: SessionSummaryDto,
    description: 'Array of messages from the session to summarize',
  })
  @ApiResponse({
    status: 200,
    description: 'Session summary generated successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(SummaryResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data - messages array is required',
  })
  async generateSummary(
    @Body() request: SessionSummaryDto,
  ): Promise<ApiResponseDto<SummaryResponseDto>> {
    if (!request.messages?.length) {
      throw new BadRequestException(
        'Messages array is required and cannot be empty',
      );
    }

    const summary = await this.aiService.generateSessionSummary(
      request.messages,
    );

    return {
      success: true,
      data: { summary },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('moderate-content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if content should be flagged',
    description:
      'Analyzes content for potentially harmful material including self-harm expressions, abusive language, or inappropriate content.',
  })
  @ApiBody({
    type: ContentModerationDto,
    description: 'Content to analyze for moderation flags',
  })
  @ApiResponse({
    status: 200,
    description: 'Content moderation analysis completed',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(ModerationResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data - content is required',
  })
  async moderateContent(
    @Body() request: ContentModerationDto,
  ): Promise<ApiResponseDto<ModerationResponseDto>> {
    if (!request.content?.trim()) {
      throw new BadRequestException('Content is required for moderation');
    }

    const result = await this.aiService.shouldFlagMessage(request.content);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check AI service health',
    description:
      'Performs a health check on the AI service by testing connectivity and basic functionality.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI service is healthy and responsive',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(HealthResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 503,
    description: 'AI service is unavailable or experiencing issues',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        status: { type: 'string', example: 'unhealthy' },
        error: { type: 'string', example: 'Connection to Ollama failed' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
      },
    },
  })
  async checkHealth(): Promise<ApiResponseDto<HealthResponseDto>> {
    try {
      // Test with a simple sentiment analysis
      await this.aiService.analyzeSentiment('Hello, how are you?');

      return {
        success: true,
        data: {
          status: 'healthy',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        data: {
          status: 'unhealthy',
          error: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('semantic-search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search for semantically similar messages',
    description:
      'Uses vector embeddings to find messages that are semantically similar to the provided query within a specific session.',
  })
  @ApiBody({
    type: SemanticSearchDto,
    description:
      'Search parameters including query text, session ID, and optional limits',
  })
  @ApiResponse({
    status: 200,
    description: 'Semantic search completed successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(SemanticSearchResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data - query and sessionId are required',
  })
  async semanticSearch(
    @Body() request: SemanticSearchDto,
  ): Promise<ApiResponseDto<SemanticSearchResponseDto>> {
    if (!request.query?.trim()) {
      throw new BadRequestException('Search query is required');
    }
    if (!request.sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    const results = await this.aiService.findSimilarMessages(
      request.query,
      request.sessionId,
      request.limit || 5,
      request.threshold || 0.7,
    );

    return {
      success: true,
      data: { results, count: results.length },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('generate-embedding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate embedding for text',
    description:
      'Generates a vector embedding for the provided text using the Nomic Embed model for semantic search and similarity comparisons.',
  })
  @ApiBody({
    type: EmbeddingDto,
    description: 'Text content to generate vector embedding for',
  })
  @ApiResponse({
    status: 200,
    description: 'Embedding generated successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(EmbeddingResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data - text is required',
  })
  async generateEmbedding(
    @Body() request: EmbeddingDto,
  ): Promise<ApiResponseDto<EmbeddingResponseDto>> {
    if (!request.text?.trim()) {
      throw new BadRequestException(
        'Text is required for embedding generation',
      );
    }

    const embedding = await this.aiService.generateEmbedding(request.text);

    if (!embedding) {
      throw new InternalServerErrorException('Failed to generate embedding');
    }

    return {
      success: true,
      data: {
        embedding,
        dimensions: embedding.length,
        model: 'nomic-embed-text',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('embedding-stats/:sessionId')
  @ApiOperation({
    summary: 'Get embedding statistics for a session',
    description:
      'Retrieves comprehensive statistics about embeddings generated for a specific session, including coverage and similarity metrics.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Unique session identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Embedding statistics retrieved successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(EmbeddingStatsResponseDto) },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid session ID format',
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found',
  })
  async getEmbeddingStats(
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponseDto<EmbeddingStatsResponseDto>> {
    if (!sessionId?.trim()) {
      throw new BadRequestException('Session ID is required');
    }

    try {
      const stats = await this.aiService.getEmbeddingStats(sessionId);

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        data: {
          totalEmbeddings: 0,
          averageSimilarity: 0,
          embeddingCoverage: 0,
          lastGenerated: null,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
