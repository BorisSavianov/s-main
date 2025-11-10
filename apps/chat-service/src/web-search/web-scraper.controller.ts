// apps/chat-service/src/web-search/web-scraper.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { WebScraperService } from './web-scraper.service';
import { ScraperAIIntegrationService } from './scraper-ai-integration.service';
import { JwtAuthGuard } from 'apps/auth-service/src/auth/guards/jwt-auth.guard';
import { GetUser } from 'apps/auth-service/src/auth/decorators/get-user.decorator';
import {
  ScrapeQueryDto,
  IntegratedSearchDto,
  ScraperResponseDto,
  EnhancedContextDto,
  IntegratedSearchResponseDto,
} from './dto/web-scrape.dto';

@Controller('web-scraper')
@ApiTags('Web Scraper')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class WebScraperController {
  constructor(
    private readonly webScraperService: WebScraperService,
    private readonly scraperAIIntegrationService: ScraperAIIntegrationService,
  ) {}

  @Post('scrape')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Scrape and process Whoogle JSON search results',
    description:
      'Perform web search via Whoogle and extract structured data from JSON response',
  })
  @ApiBody({ type: ScrapeQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Scraping completed successfully',
    type: ScraperResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - authentication required',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded',
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Whoogle service error',
  })
  async scrapeSearchResults(
    @Body() body: ScrapeQueryDto,
    @GetUser() user: any,
  ) {
    const results = await this.webScraperService.scrapeSearchResults(
      body.query,
      user.id,
    );

    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('scrape/enhanced')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Scrape and format for AI integration',
    description:
      'Scrape search results and format them for AI service consumption with enhanced context',
  })
  @ApiBody({ type: ScrapeQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Enhanced context generated successfully',
    type: EnhancedContextDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async scrapeForAI(@Body() body: ScrapeQueryDto, @GetUser() user: any) {
    const scraperResponse = await this.webScraperService.scrapeSearchResults(
      body.query,
      user.id,
    );

    const enhancedContext = this.webScraperService.buildEnhancedContext(
      scraperResponse,
      body.maxResults || 5,
    );

    const aiPrompt = this.webScraperService.formatForAIPrompt(enhancedContext);

    return {
      success: true,
      data: {
        enhancedContext,
        aiPrompt,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('integrated-search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perform integrated web search with AI response',
    description:
      'Combines web scraping with AI response generation for context-aware answers',
  })
  @ApiBody({ type: IntegratedSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Integrated search completed successfully',
    type: IntegratedSearchResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  async integratedSearch(
    @Body() body: IntegratedSearchDto,
    @GetUser() user: any,
  ) {
    const response =
      await this.scraperAIIntegrationService.processWithWebSearch({
        userMessage: body.userMessage,
        sessionId: body.sessionId,
        userId: user.id,
        performWebSearch: body.performWebSearch ?? true,
        maxSearchResults: body.maxSearchResults || 5,
      });

    return {
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get user scraping statistics',
    description:
      'Retrieve scraping history and statistics for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getStats(@GetUser() user: any) {
    const stats = await this.webScraperService.getUserScrapingStats(user.id);

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check web scraper service health',
    description: 'Verify scraper and Whoogle service availability',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  @ApiResponse({
    status: 503,
    description: 'Service is unhealthy',
  })
  async healthCheck() {
    const isHealthy = await this.webScraperService.healthCheck();

    return {
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'Whoogle Web Scraper',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
