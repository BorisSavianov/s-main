// ==================================================================================
// apps/chat-service/src/web-search/scraper-ai-integration.service.ts - UPDATED
// ==================================================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  WebScraperService,
  NormalizedScraperResponse,
  EnhancedContext,
} from './web-scraper.service';
import { EnhancedAIService } from '../ai/web-ai.service';
import { IntegratedSearchResponseDto } from './dto/web-scrape.dto';

interface IntegratedSearchRequest {
  userMessage: string;
  sessionId: string;
  userId: string;
  performWebSearch: boolean;
  maxSearchResults?: number;
}

@Injectable()
export class ScraperAIIntegrationService {
  private readonly logger = new Logger(ScraperAIIntegrationService.name);

  constructor(
    private readonly webScraperService: WebScraperService,
    private readonly enhancedAIService: EnhancedAIService,
  ) {}

  /**
   * Main integration method - combines enhanced web scraping with AI response
   */
  async processWithWebSearch(
    request: IntegratedSearchRequest,
  ): Promise<IntegratedSearchResponseDto> {
    const startTime = Date.now();

    try {
      let enhancedContext: EnhancedContext | undefined;
      let searchQuery: string | undefined;
      let webSearchPerformed = false;
      let fullContentAvailable = false;

      // Determine if web search should be performed
      if (
        request.performWebSearch &&
        this.shouldPerformWebSearch(request.userMessage)
      ) {
        this.logger.debug(
          `Enhanced web search triggered for user ${request.userId}: ${request.userMessage}`,
        );

        // Extract search query
        searchQuery = this.extractSearchQuery(request.userMessage);

        // Perform enhanced web scraping with HTML extraction
        const scraperResponse =
          await this.webScraperService.scrapeSearchResults(
            searchQuery,
            request.userId,
          );

        this.logger.debug(
          `Scraper response: ${scraperResponse.results.length} results, ` +
            `${scraperResponse.processingStats.htmlFetchSuccess} HTML fetches successful`,
        );

        // Build enhanced context
        enhancedContext = this.webScraperService.buildEnhancedContext(
          scraperResponse,
          request.maxSearchResults || 5,
        );

        webSearchPerformed = true;
        fullContentAvailable = enhancedContext.fullTextContent
          ? enhancedContext.fullTextContent.length > 0
          : false;

        this.logger.debug(
          `Enhanced context built: ${enhancedContext.searchResults.length} sources, ` +
            `full content available: ${fullContentAvailable}`,
        );
      }

      // Generate AI response with enhanced context
      const aiResponse =
        await this.enhancedAIService.generateResponseWithSearch(
          {
            userMessage: request.userMessage,
            sessionId: request.sessionId,
            userId: request.userId,
            webSearchEnabled: request.performWebSearch,
            recentMessages: [], // Pass from actual session if needed
          },
          'message-id', // Pass actual message ID if available
        );

      return {
        aiResponse: aiResponse.content,
        webSearchPerformed,
        searchQuery,
        sourcesUsed: enhancedContext?.searchResults.length || 0,
        searchResults: enhancedContext,
        processingTime: Date.now() - startTime,
        citations: aiResponse.citations,
        metadata: {
          fullContentAvailable,
          extractedContentUsed: aiResponse.extractedContent || false,
          confidenceScore: aiResponse.confidence!,
        },
      };
    } catch (error) {
      this.logger.error(
        `Integrated search processing failed: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Determine if web search should be performed
   */
  private shouldPerformWebSearch(message: string): boolean {
    const searchTriggers = [
      /what('s| is| are) the (latest|current|recent)/i,
      /today('s)?|this (week|month|year)/i,
      /news about/i,
      /happening (now|currently)/i,
      /search for/i,
      /look up/i,
      /find information/i,
      /tell me about.*\d{4}/i,
      /weather (in|at|for)/i,
      /price of/i,
      /stock (price|market)/i,
      /when (did|was|is)/i,
      /where (is|can|does)/i,
      /how (many|much|long)/i,
      /statistics (about|on|for)/i,
      /research (on|about)/i,
      /latest (version|update|release)/i,
    ];

    return searchTriggers.some((pattern) => pattern.test(message));
  }

  /**
   * Extract search query from user message
   */
  private extractSearchQuery(message: string): string {
    let query = message
      .replace(
        /^(search for|look up|find|tell me about|what('s| is| are))\s+/i,
        '',
      )
      .trim();

    if (query.length > 200) {
      query = query.substring(0, 200);
    }

    return query;
  }

  /**
   * Validate and sanitize enhanced search results
   */
  async validateSearchResults(
    scraperResponse: NormalizedScraperResponse,
  ): Promise<{
    valid: boolean;
    warnings: string[];
    sanitizedResults: NormalizedScraperResponse;
  }> {
    const warnings: string[] = [];

    if (scraperResponse.processingStats.averageRelevanceScore < 0.5) {
      warnings.push(
        'Low average relevance score - results may not be highly relevant',
      );
    }

    if (scraperResponse.processingStats.failedExtractions > 0) {
      warnings.push(
        `${scraperResponse.processingStats.failedExtractions} results failed extraction`,
      );
    }

    if (
      scraperResponse.processingStats.htmlFetchFailed >
      scraperResponse.processingStats.htmlFetchSuccess
    ) {
      warnings.push(
        'Majority of HTML fetches failed - limited full content available',
      );
    }

    const sanitizedResults = {
      ...scraperResponse,
      results: scraperResponse.results.filter(
        (result) =>
          (result.relevanceScore || 0) >= 0.6 &&
          (result.description.length > 50 || result.extractedContent?.mainText),
      ),
    };

    return {
      valid: sanitizedResults.results.length > 0,
      warnings,
      sanitizedResults,
    };
  }

  /**
   * Generate structured response for mental health queries with enhanced data
   */
  async processHealthQuery(
    query: string,
    userId: string,
  ): Promise<{
    response: string;
    sources: Array<{
      title: string;
      url: string;
      reliability: string;
      hasFullContent: boolean;
    }>;
    disclaimer: string;
    fullContentAvailable: boolean;
  }> {
    try {
      const scraperResponse = await this.webScraperService.scrapeSearchResults(
        query,
        userId,
      );

      const validation = await this.validateSearchResults(scraperResponse);

      if (!validation.valid) {
        return {
          response:
            'I found limited reliable information on this topic. Please consult with a healthcare professional for accurate guidance.',
          sources: [],
          disclaimer:
            'Mental health information should always be verified with qualified professionals.',
          fullContentAvailable: false,
        };
      }

      const reliableSources = this.filterHealthSources(
        validation.sanitizedResults.results,
      );

      const enhancedContext = this.webScraperService.buildEnhancedContext(
        validation.sanitizedResults,
        5,
      );

      const fullContentAvailable = enhancedContext.fullTextContent
        ? enhancedContext.fullTextContent.length > 0
        : false;

      return {
        response: `Based on current information: ${enhancedContext.contextSummary}`,
        sources: reliableSources.map((result) => ({
          title: result.title,
          url: result.url,
          reliability: this.assessSourceReliability(result.metadata.domain),
          hasFullContent: !!result.extractedContent?.mainText,
        })),
        disclaimer:
          'This information is for educational purposes only and should not replace professional medical advice.',
        fullContentAvailable,
      };
    } catch (error) {
      this.logger.error(`Health query processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Filter health-related sources for reliability
   */
  private filterHealthSources(results: any[]): any[] {
    const reliableDomains = [
      'nih.gov',
      'cdc.gov',
      'who.int',
      'mayoclinic.org',
      'webmd.com',
      'healthline.com',
      'medlineplus.gov',
      'nimh.nih.gov',
      'samhsa.gov',
      'nami.org',
    ];

    return results.filter((result) => {
      const domain = result.metadata?.domain || '';
      return (
        reliableDomains.some((reliable) => domain.includes(reliable)) ||
        (result.relevanceScore || 0) > 0.8
      );
    });
  }

  /**
   * Assess source reliability
   */
  private assessSourceReliability(domain: string): string {
    const highReliability = ['nih.gov', 'cdc.gov', 'who.int', 'gov', 'edu'];
    const mediumReliability = [
      'mayoclinic.org',
      'webmd.com',
      'healthline.com',
      'org',
    ];

    if (highReliability.some((d) => domain.includes(d))) {
      return 'high';
    }
    if (mediumReliability.some((d) => domain.includes(d))) {
      return 'medium';
    }
    return 'low';
  }
}
