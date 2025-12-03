// apps/chat-service/src/web-search/web-scraper.controller.ts - UPDATED
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
    summary: 'Scrape and process Google api JSON search results (Enhanced)',
    description:
      'Perform web search via Google api, extract structured data, and fetch full HTML content from result pages',
  })
  @ApiBody({ type: ScrapeQueryDto })
  @ApiResponse({
    status: 200,
    description:
      'Scraping completed successfully with enhanced content extraction',
    type: ScraperResponseDto,
  })
  async scrapeSearchResults(
    @Body() body: ScrapeQueryDto,
    @GetUser() user: any,
  ) {
    // Use enhanced scraper with HTML fetching
    const results = await this.webScraperService.scrapeSearchResults(
      body.query,
      user.id,
    );

    return {
      success: true,
      data: results,
      metadata: {
        htmlFetchEnabled: true,
        htmlFetchSuccess: results.processingStats.htmlFetchSuccess,
        htmlFetchFailed: results.processingStats.htmlFetchFailed,
        extractedContentAvailable: results.results.some(
          (r) => r.extractedContent,
        ),
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('scrape/legacy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Scrape results in legacy format (Backward Compatible)',
    description: 'Returns results in the old format for backward compatibility',
  })
  @ApiBody({ type: ScrapeQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Scraping completed in legacy format',
  })
  async scrapeSearchResultsLegacy(
    @Body() body: ScrapeQueryDto,
    @GetUser() user: any,
  ) {
    const results = await this.webScraperService.scrapeSearchResultsLegacy(
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
    summary: 'Scrape and format for AI integration with full content',
    description:
      'Scrape search results with HTML extraction and format for AI service consumption',
  })
  @ApiBody({ type: ScrapeQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Enhanced context generated with full content extraction',
    type: EnhancedContextDto,
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
        metadata: {
          fullContentAvailable: enhancedContext.fullTextContent
            ? enhancedContext.fullTextContent.length > 0
            : false,
          extractedContentCount: enhancedContext.searchResults.filter(
            (r) => r.extractedContent,
          ).length,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('integrated-search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perform integrated web search with enhanced AI response',
    description:
      'Combines enhanced web scraping (with HTML extraction) and AI response generation',
  })
  @ApiBody({ type: IntegratedSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Integrated search with full content extraction completed',
    type: IntegratedSearchResponseDto,
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
    description: 'Verify scraper and Google Custom Search API availability',
  })
  async healthCheck() {
    const isHealthy = await this.webScraperService.healthCheck();

    return {
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'Enhanced Google Custom Search with HTML Extraction',
        features: {
          htmlFetchEnabled: true,
          contentExtraction: true,
          deduplication: true,
          safetyFiltering: true,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
