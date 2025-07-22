// apps/chat-service/src/search/search.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { SearchService } from './search.service';

@Controller('search')
@ApiTags('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Search chat messages' })
  @ApiQuery({ name: 'q', description: 'Search query', required: false })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({
    name: 'senderType',
    description: 'Sender type filter',
    required: false,
  })
  @ApiQuery({
    name: 'sentiment',
    description: 'Sentiment filter',
    required: false,
  })
  @ApiQuery({ name: 'limit', description: 'Result limit', required: false })
  @ApiQuery({ name: 'offset', description: 'Result offset', required: false })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  async searchMessages(
    @Query('q') query?: string,
    @Query('sessionId') sessionId?: string,
    @Query('senderType') senderType?: 'user' | 'ai' | 'counselor',
    @Query('sentiment') sentiment?: 'positive' | 'negative' | 'neutral',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const searchQuery = {
      query: query || '',
      sessionId,
      senderType,
      sentiment,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit || 20,
      offset: offset || 0,
    };

    const results = await this.searchService.searchMessages(searchQuery);

    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('semantic')
  @ApiOperation({ summary: 'Semantic search using embeddings' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({ name: 'limit', description: 'Result limit', required: false })
  @ApiResponse({ status: 200, description: 'Semantic search results returned' })
  async semanticSearch(
    @Query('q') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: number,
  ) {
    const results = await this.searchService.semanticSearch(
      query,
      sessionId,
      limit || 10,
    );

    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search suggestions for autocomplete' })
  @ApiQuery({ name: 'prefix', description: 'Search prefix', required: true })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Suggestions returned' })
  async getSuggestions(
    @Query('prefix') prefix: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const suggestions = await this.searchService.getSuggestions(
      prefix,
      sessionId,
    );

    return {
      success: true,
      data: { suggestions },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get search analytics' })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date filter',
    required: false,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date filter',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Analytics data returned' })
  async getAnalytics(
    @Query('sessionId') sessionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const analytics = await this.searchService.getSearchAnalytics(
      sessionId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return {
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Check search service health' })
  @ApiResponse({ status: 200, description: 'Search service is healthy' })
  @ApiResponse({ status: 503, description: 'Search service is unhealthy' })
  async checkHealth() {
    const health = await this.searchService.healthCheck();

    return {
      success: health.status === 'healthy',
      data: health,
      timestamp: new Date().toISOString(),
    };
  }
}
