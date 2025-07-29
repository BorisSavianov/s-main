// apps/chat-service/src/search/search.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  ParseBoolPipe,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { SearchService } from './search.service';
import { SemanticSearchResultDto } from '../ai/dto/ai.dto';

// DTOs for request validation
class SearchMessageDto {
  query?: string;
  sessionId?: string;
  userId?: string;
  senderType?: 'user' | 'ai' | 'counselor';
  sentiment?: 'positive' | 'negative' | 'neutral';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  includeHighlights?: boolean;
  includeFacets?: boolean;
}

class SemanticSearchDto {
  query: string;
  sessionId?: string;
  limit?: number;
  threshold?: number;
}

class HybridSearchDto {
  query: string;
  sessionId?: string;
  limit?: number;
  textWeight?: number;
  semanticWeight?: number;
}

@Controller('search')
@ApiTags('search')
@UseGuards(ThrottlerGuard) // Rate limiting
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('messages')
  @ApiOperation({
    summary: 'Search chat messages with advanced filtering',
    description:
      'Search through chat messages using text search with various filters and options',
  })
  @ApiQuery({ name: 'q', description: 'Search query', required: false })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({ name: 'userId', description: 'User ID filter', required: false })
  @ApiQuery({
    name: 'senderType',
    description: 'Sender type filter',
    required: false,
    enum: ['user', 'ai', 'counselor'],
  })
  @ApiQuery({
    name: 'sentiment',
    description: 'Sentiment filter',
    required: false,
    enum: ['positive', 'negative', 'neutral'],
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date filter (ISO string)',
    required: false,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date filter (ISO string)',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Result limit (max 100)',
    required: false,
    type: 'number',
  })
  @ApiQuery({
    name: 'offset',
    description: 'Result offset',
    required: false,
    type: 'number',
  })
  @ApiQuery({
    name: 'includeHighlights',
    description: 'Include search highlights',
    required: false,
    type: 'boolean',
  })
  @ApiQuery({
    name: 'includeFacets',
    description: 'Include faceted results',
    required: false,
    type: 'boolean',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results returned successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async searchMessages(
    @Query('q') query?: string,
    @Query('sessionId') sessionId?: string,
    @Query('userId') userId?: string,
    @Query('senderType') senderType?: 'user' | 'ai' | 'counselor',
    @Query('sentiment') sentiment?: 'positive' | 'negative' | 'neutral',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('includeHighlights', new ParseBoolPipe({ optional: true }))
    includeHighlights?: boolean,
    @Query('includeFacets', new ParseBoolPipe({ optional: true }))
    includeFacets?: boolean,
  ) {
    // Validate parameters
    if (limit && (limit < 1 || limit > 100)) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    if (offset && offset < 0) {
      throw new BadRequestException('Offset must be non-negative');
    }

    if (startDate && isNaN(Date.parse(startDate))) {
      throw new BadRequestException('Invalid start date format');
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      throw new BadRequestException('Invalid end date format');
    }

    const searchQuery = {
      query: query || '',
      sessionId,
      userId,
      senderType,
      sentiment,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit || 20,
      offset: offset || 0,
      includeHighlights: includeHighlights ?? true,
      includeFacets: includeFacets ?? true,
    };

    const results = await this.searchService.searchMessages(searchQuery);

    return {
      success: true,
      data: results,
      metadata: {
        searchType: 'text',
        timestamp: new Date().toISOString(),
        executionTime: results.took,
      },
    };
  }

  @Get('semantic')
  @ApiOperation({
    summary: 'Semantic search using vector embeddings',
    description: 'Search for semantically similar messages using AI embeddings',
  })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Result limit (max 50)',
    required: false,
    type: 'number',
  })
  @ApiQuery({
    name: 'threshold',
    description: 'Similarity threshold (0-1)',
    required: false,
    type: 'number',
  })
  @ApiResponse({ status: 200, description: 'Semantic search results returned' })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  async semanticSearch(
    @Query('q') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('threshold') threshold?: number,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }

    if (threshold && (threshold < 0 || threshold > 1)) {
      throw new BadRequestException('Threshold must be between 0 and 1');
    }

    const results = await this.searchService.semanticSearch(
      query.trim(),
      sessionId,
      limit || 10,
      threshold || 0.7,
    );

    return {
      success: true,
      data: results,
      metadata: {
        searchType: 'semantic',
        timestamp: new Date().toISOString(),
        threshold: threshold || 0.7,
      },
    };
  }

  @Get('hybrid')
  @ApiOperation({
    summary: 'Hybrid search combining text and semantic search',
    description:
      'Search using both text matching and semantic similarity with weighted results',
  })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Result limit (max 50)',
    required: false,
    type: 'number',
  })
  @ApiQuery({
    name: 'textWeight',
    description: 'Text search weight (0-1)',
    required: false,
    type: 'number',
  })
  @ApiQuery({
    name: 'semanticWeight',
    description: 'Semantic search weight (0-1)',
    required: false,
    type: 'number',
  })
  @ApiResponse({ status: 200, description: 'Hybrid search results returned' })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  async hybridSearch(
    @Query('q') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('textWeight') textWeight?: number,
    @Query('semanticWeight') semanticWeight?: number,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }

    const tWeight = textWeight ?? 0.7;
    const sWeight = semanticWeight ?? 0.3;

    if (tWeight < 0 || tWeight > 1 || sWeight < 0 || sWeight > 1) {
      throw new BadRequestException('Weights must be between 0 and 1');
    }

    if (Math.abs(tWeight + sWeight - 1.0) > 0.01) {
      throw new BadRequestException(
        'Text weight and semantic weight must sum to 1.0',
      );
    }

    const results = await this.searchService.hybridSearch(
      query.trim(),
      sessionId,
      limit || 10,
      tWeight,
      sWeight,
    );

    return {
      success: true,
      data: results,
      metadata: {
        searchType: 'hybrid',
        textWeight: tWeight,
        semanticWeight: sWeight,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Get search suggestions for autocomplete',
    description:
      'Get intelligent search suggestions based on user input and context',
  })
  @ApiQuery({
    name: 'prefix',
    description: 'Search prefix for suggestions',
    required: true,
  })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID for context-aware suggestions',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of suggestions (max 20)',
    required: false,
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggestions returned successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async getSuggestions(
    @Query('prefix') prefix: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    if (!prefix || prefix.trim().length < 2) {
      throw new BadRequestException(
        'Prefix must be at least 2 characters long',
      );
    }

    if (limit && (limit < 1 || limit > 20)) {
      throw new BadRequestException('Limit must be between 1 and 20');
    }

    const suggestions = await this.searchService.getSuggestions(
      prefix.trim(),
      sessionId,
      limit || 10,
    );

    return {
      success: true,
      data: {
        prefix: prefix.trim(),
        suggestions,
        count: suggestions.length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get comprehensive search analytics',
    description:
      'Retrieve detailed analytics about search patterns and message content',
  })
  @ApiQuery({
    name: 'sessionId',
    description: 'Session ID filter',
    required: false,
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date filter (ISO string)',
    required: false,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date filter (ISO string)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics data returned successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  async getAnalytics(
    @Query('sessionId') sessionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && isNaN(Date.parse(startDate))) {
      throw new BadRequestException('Invalid start date format');
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      throw new BadRequestException('Invalid end date format');
    }

    const analytics = await this.searchService.getSearchAnalytics(
      sessionId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return {
      success: true,
      data: analytics,
      metadata: {
        filters: {
          sessionId,
          startDate,
          endDate,
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('performance')
  @ApiOperation({
    summary: 'Get search service performance metrics',
    description: 'Retrieve performance metrics for monitoring and optimization',
  })
  @ApiResponse({ status: 200, description: 'Performance metrics returned' })
  async getPerformanceMetrics() {
    const metrics = await this.searchService.getPerformanceMetrics();

    return {
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get search usage statistics',
    description: 'Get aggregated statistics about search usage patterns',
  })
  @ApiResponse({ status: 200, description: 'Search statistics returned' })
  async getSearchStats() {
    const stats = await this.searchService.getSearchStats();

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check search service health',
    description:
      'Comprehensive health check including Elasticsearch cluster status',
  })
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

  @Post('reindex/:sessionId')
  @ApiOperation({
    summary: 'Reindex all messages for a session',
    description: 'Trigger reindexing of all messages in a specific session',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID to reindex' })
  @ApiResponse({
    status: 202,
    description: 'Reindexing job queued successfully',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexSession(@Param('sessionId') sessionId: string) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID is required');
    }

    await this.searchService.reindexSession(sessionId.trim());

    return {
      success: true,
      message: `Reindexing job queued for session ${sessionId}`,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('index/message/:messageId')
  @ApiOperation({
    summary: 'Index a specific message',
    description: 'Manually trigger indexing of a specific message',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID to index' })
  @ApiResponse({ status: 202, description: 'Message queued for indexing' })
  @HttpCode(HttpStatus.ACCEPTED)
  async indexMessage(
    @Param('messageId') messageId: string,
    @Query('priority', new ParseIntPipe({ optional: true })) priority?: number,
  ) {
    if (!messageId || messageId.trim().length === 0) {
      throw new BadRequestException('Message ID is required');
    }

    await this.searchService.queueMessageForIndexing(
      messageId.trim(),
      priority || 0,
    );

    return {
      success: true,
      message: `Message ${messageId} queued for indexing`,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('message/:messageId')
  @ApiOperation({
    summary: 'Remove message from search index',
    description: 'Delete a specific message from the search index',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID to remove' })
  @ApiResponse({ status: 200, description: 'Message removed from index' })
  @ApiResponse({ status: 404, description: 'Message not found in index' })
  async deleteMessageFromIndex(@Param('messageId') messageId: string) {
    if (!messageId || messageId.trim().length === 0) {
      throw new BadRequestException('Message ID is required');
    }

    await this.searchService.deleteMessage(messageId.trim());

    return {
      success: true,
      message: `Message ${messageId} removed from search index`,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('cleanup')
  @ApiOperation({
    summary: 'Clean up old search data',
    description: 'Remove search data older than specified number of days',
  })
  @ApiQuery({
    name: 'olderThanDays',
    description: 'Remove data older than this many days',
    required: false,
    type: 'number',
  })
  @ApiResponse({ status: 200, description: 'Cleanup completed successfully' })
  @HttpCode(HttpStatus.OK)
  async cleanupOldData(
    @Query('olderThanDays', new ParseIntPipe({ optional: true }))
    olderThanDays?: number,
  ) {
    const days = olderThanDays || 30;

    if (days < 1 || days > 365) {
      throw new BadRequestException('Days must be between 1 and 365');
    }

    await this.searchService.cleanupOldData(days);

    return {
      success: true,
      message: `Search data older than ${days} days has been cleaned up`,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('sessions/:sessionId/similar')
  @ApiOperation({
    summary: 'Find similar sessions',
    description: 'Find sessions with similar conversation patterns',
  })
  @ApiParam({ name: 'sessionId', description: 'Reference session ID' })
  @ApiQuery({
    name: 'limit',
    description: 'Number of similar sessions to return',
    required: false,
    type: 'number',
  })
  @ApiResponse({ status: 200, description: 'Similar sessions found' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async findSimilarSessions(
    @Param('sessionId') sessionId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID is required');
    }

    if (limit && (limit < 1 || limit > 20)) {
      throw new BadRequestException('Limit must be between 1 and 20');
    }

    // This would use the AI service's findSimilarConversations method
    // For now, we'll implement a basic version using search
    const results = await this.searchService.searchMessages({
      query: '',
      sessionId: sessionId.trim(),
      limit: 1,
      includeFacets: false,
      includeHighlights: false,
    });

    if (results.total === 0) {
      throw new NotFoundException(
        'Session not found or has no indexed messages',
      );
    }

    // This is a simplified implementation
    // In a full implementation, you'd use semantic similarity
    return {
      success: true,
      data: {
        referenceSessionId: sessionId,
        similarSessions: [], // Would contain actual similar sessions
        message:
          'Similar session detection requires semantic analysis implementation',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('export/:sessionId')
  @ApiOperation({
    summary: 'Export session search data',
    description: 'Export all searchable data for a session',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID to export' })
  @ApiQuery({
    name: 'format',
    description: 'Export format',
    required: false,
    enum: ['json', 'csv'],
  })
  @ApiResponse({ status: 200, description: 'Session data exported' })
  async exportSessionData(
    @Param('sessionId') sessionId: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID is required');
    }

    const results = await this.searchService.searchMessages({
      query: '',
      sessionId: sessionId.trim(),
      limit: 1000, // Large limit for export
      includeFacets: false,
      includeHighlights: false,
    });

    if (results.total === 0) {
      throw new NotFoundException('No data found for session');
    }

    const exportFormat = format || 'json';

    if (exportFormat === 'csv') {
      // Convert to CSV format
      const csvHeaders = 'id,content,senderType,sentiment,createdAt\n';
      const csvRows = results.results
        .map(
          (msg) =>
            `"${msg.id}","${msg.content.replace(/"/g, '""')}","${msg.senderType}","${msg.sentiment || ''}","${msg.createdAt.toISOString()}"`,
        )
        .join('\n');

      return {
        success: true,
        data: csvHeaders + csvRows,
        format: 'csv',
        totalRecords: results.total,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: {
        sessionId,
        messages: results.results,
        totalRecords: results.total,
        exportedAt: new Date().toISOString(),
      },
      format: 'json',
      timestamp: new Date().toISOString(),
    };
  }
}
