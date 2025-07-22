// apps/chat-service/src/ai/ai.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { AIService } from './ai.service';

interface AIResponse {
  content: string;
  metadata?: Record<string, any>;
}

interface GenerateResponseRequest {
  sessionId: string;
  userMessage: string;
  recentMessages: Array<{
    senderType: string;
    content: string;
    createdAt: Date;
  }>;
}

interface SentimentAnalysisRequest {
  text: string;
}

interface SessionSummaryRequest {
  messages: Array<{
    content: string;
    senderType: string;
  }>;
}

interface ContentModerationRequest {
  content: string;
}

@Controller('ai')
@ApiTags('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('generate-response')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate AI response to user message' })
  @ApiBody({
    type: Object,
    description:
      'Chat context including session ID, user message, and recent messages',
  })
  @ApiResponse({
    status: 200,
    description: 'AI response generated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 500, description: 'AI service error' })
  async generateResponse(@Body() request: GenerateResponseRequest): Promise<{
    success: boolean;
    data: AIResponse;
    timestamp: string;
  }> {
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
  }

  @Post('analyze-sentiment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze sentiment of text' })
  @ApiBody({ type: Object, description: 'Text to analyze' })
  @ApiResponse({ status: 200, description: 'Sentiment analysis completed' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async analyzeSentiment(@Body() request: SentimentAnalysisRequest) {
    const sentiment = await this.aiService.analyzeSentiment(request.text);

    return {
      success: true,
      data: { sentiment },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('generate-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate session summary' })
  @ApiBody({ type: Object, description: 'Messages to summarize' })
  @ApiResponse({ status: 200, description: 'Summary generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async generateSummary(@Body() request: SessionSummaryRequest) {
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
  @ApiOperation({ summary: 'Check if content should be flagged' })
  @ApiBody({ type: Object, description: 'Content to moderate' })
  @ApiResponse({ status: 200, description: 'Content moderation completed' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async moderateContent(@Body() request: ContentModerationRequest) {
    const result = await this.aiService.shouldFlagMessage(request.content);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Check AI service health' })
  @ApiResponse({ status: 200, description: 'AI service is healthy' })
  @ApiResponse({ status: 503, description: 'AI service is unavailable' })
  async checkHealth() {
    try {
      // Test with a simple sentiment analysis
      await this.aiService.analyzeSentiment('Hello, how are you?');

      return {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
