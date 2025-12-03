// apps/chat-service/src/web-search/web-search.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { GoogleSearchService } from './google-search.service';

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly maxResults: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheTTL: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRedis() private readonly redis: Redis,
    private readonly googleSearchService: GoogleSearchService,
  ) {
    this.maxResults = this.configService.get<number>(
      'WEB_SEARCH_MAX_RESULTS',
      5,
    );
    this.cacheEnabled = this.configService.get<boolean>(
      'WEB_SEARCH_CACHE_ENABLED',
      true,
    );
    this.cacheTTL = this.configService.get<number>(
      'WEB_SEARCH_CACHE_TTL',
      3600,
    );
  }

  /**
   * Perform web search using Google Custom Search API
   */
  async search(query: string, userId: string): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = await this.getCachedResults(query);
        if (cached) {
          this.logger.debug(`Cache hit for query: ${query}`);
          return cached;
        }
      }

      // Perform search using Google Custom Search
      const googleResults = await this.googleSearchService.search(query, {
        num: this.maxResults,
      });

      // Transform Google results to legacy format
      const results: SearchResult[] = googleResults.results.map((result) => ({
        title: result.title,
        url: result.url,
        content: result.description,
        score: result.relevanceScore || 0.8,
        publishedDate: result.metadata.publishDate,
      }));

      const response: SearchResponse = {
        query,
        results,
        totalResults: googleResults.totalResults,
        searchTime: Date.now() - startTime,
      };

      // Cache results
      if (this.cacheEnabled && results.length > 0) {
        await this.cacheResults(query, response);
      }

      // Log search activity
      await this.logSearchActivity(userId, query, results.length);

      return response;
    } catch (error) {
      this.logger.error(`Search failed for query "${query}": ${error.message}`);
      
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Web search service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Build context from search results for AI
   */
  buildSearchContext(searchResponse: SearchResponse): string {
    if (!searchResponse.results.length) {
      return '';
    }

    const contextParts = [
      '\n[Web Search Results]',
      `Query: "${searchResponse.query}"`,
      `Found ${searchResponse.totalResults} results:\n`,
    ];

    searchResponse.results.forEach((result, index) => {
      contextParts.push(
        `[${index + 1}] ${result.title}`,
        `URL: ${result.url}`,
        `Content: ${result.content.substring(0, 300)}...`,
        '',
      );
    });

    contextParts.push(
      "[Instructions] Use these search results as additional context when answering the user's question. Cite sources when using information from search results.\n",
    );

    return contextParts.join('\n');
  }

  /**
   * Determine if a query should trigger web search
   */
  shouldPerformSearch(message: string): boolean {
    const searchTriggers = [
      /what('s| is| are) the (latest|current|recent)/i,
      /today('s)?|this (week|month|year)/i,
      /news about/i,
      /happening (now|currently)/i,
      /search for/i,
      /look up/i,
      /find information/i,
      /tell me about.*\d{4}/i, // Questions about specific years
      /weather (in|at|for)/i,
      /price of/i,
      /stock (price|market)/i,
    ];

    return searchTriggers.some((pattern) => pattern.test(message));
  }

  /**
   * Extract search query from user message
   */
  extractSearchQuery(message: string): string {
    // Remove common prefixes
    let query = message
      .replace(
        /^(search for|look up|find|tell me about|what('s| is| are))\s+/i,
        '',
      )
      .trim();

    // Limit query length
    if (query.length > 200) {
      query = query.substring(0, 200);
    }

    return query;
  }


  /**
   * Cache search results
   */
  private async cacheResults(
    query: string,
    response: SearchResponse,
  ): Promise<void> {
    try {
      const cacheKey = `search:${query.toLowerCase().trim()}`;
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response));
    } catch (error) {
      this.logger.error(`Failed to cache search results: ${error.message}`);
    }
  }

  /**
   * Get cached search results
   */
  private async getCachedResults(
    query: string,
  ): Promise<SearchResponse | null> {
    try {
      const cacheKey = `search:${query.toLowerCase().trim()}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.error(`Failed to get cached results: ${error.message}`);
    }

    return null;
  }

  /**
   * Log search activity
   */
  private async logSearchActivity(
    userId: string,
    query: string,
    resultCount: number,
  ): Promise<void> {
    try {
      const logKey = `search:logs:${userId}`;
      const logEntry = JSON.stringify({
        query,
        resultCount,
        timestamp: new Date().toISOString(),
      });

      await this.redis.lpush(logKey, logEntry);
      await this.redis.ltrim(logKey, 0, 99); // Keep last 100 searches
      await this.redis.expire(logKey, 86400 * 30); // 30 days
    } catch (error) {
      this.logger.error(`Failed to log search activity: ${error.message}`);
    }
  }

  /**
   * Get user search statistics
   */
  async getUserSearchStats(userId: string): Promise<any> {
    try {
      const logKey = `search:logs:${userId}`;
      const logs = await this.redis.lrange(logKey, 0, -1);

      const searches = logs.map((log) => JSON.parse(log));

      return {
        totalSearches: searches.length,
        recentSearches: searches.slice(0, 10),
        averageResults:
          searches.reduce((sum, s) => sum + s.resultCount, 0) /
            searches.length || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get user search stats: ${error.message}`);
      return {
        totalSearches: 0,
        recentSearches: [],
        averageResults: 0,
      };
    }
  }

  /**
   * Health check for Google Custom Search API
   */
  async healthCheck(): Promise<boolean> {
    return await this.googleSearchService.healthCheck();
  }
}
