// apps/chat-service/src/web-search/web-search.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { WebSearchService } from './web-search.service';
import { JwtAuthGuard } from 'apps/auth-service/src/auth/guards/jwt-auth.guard';
import { GetUser } from 'apps/auth-service/src/auth/decorators/get-user.decorator';
import { IsString } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  query: string;
}

@Controller('web-search')
@ApiTags('Web Search')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class WebSearchController {
  constructor(private readonly webSearchService: WebSearchService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perform web search (authenticated users only)',
    description: 'Search the web using SearxNG and return formatted results',
  })
  @ApiResponse({
    status: 200,
    description: 'Search completed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - authentication required',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  @ApiResponse({
    status: 503,
    description: 'Search service unavailable',
  })
  async search(@Body() body: SearchQueryDto, @GetUser() user: any) {
    const results = await this.webSearchService.search(body.query, user.id);

    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('search')
  async testSearch(@Query('q') query: string) {
    if (!query) {
      return { success: false, message: 'Query parameter "q" is required' };
    }
    const searxngBaseUrl = process.env.SEARCH_URL || 'http://searxng:8080';

    try {
      const url = new URL(`${searxngBaseUrl}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('categories', 'general');
      url.searchParams.set('language', 'en');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.SEARXNG_SECRET}`,
          'X-Forwarded-For': '127.0.0.1',
          'X-Real-IP': '127.0.0.1',
          'User-Agent': 'SerenitySpaceBot/1.0',
          Host: 'searxng.local', // should match your settings.yml base_url host
        },
      });

      const data = await response;

      return {
        success: true,
        response: data,
        data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get user search statistics',
    description:
      'Retrieve search history and statistics for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats(@GetUser() user: any) {
    const stats = await this.webSearchService.getUserSearchStats(user.id);

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check web search service health',
    description: 'Verify SearxNG service availability',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  async healthCheck() {
    const isHealthy = await this.webSearchService.healthCheck();

    return {
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'SearxNG',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
