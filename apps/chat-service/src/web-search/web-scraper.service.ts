// apps/chat-service/src/web-search/web-scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * Structured result from Whoogle JSON response
 */
export interface ScrapedResult {
  title: string;
  url: string;
  description: string;
  snippet: string;
  relevanceScore: number;
  metadata: {
    domain: string;
    publishDate?: string;
    contentType?: string;
  };
}

/**
 * Complete scraper response with metadata
 */
export interface ScraperResponse {
  query: string;
  results: ScrapedResult[];
  totalResults: number;
  scrapingTime: number;
  processingStats: {
    totalPages: number;
    successfulExtractions: number;
    failedExtractions: number;
    averageRelevanceScore: number;
  };
}

/**
 * Enhanced context for AI integration
 */
export interface EnhancedContext {
  query: string;
  searchResults: ScrapedResult[];
  contextSummary: string;
  topSources: string[];
  relevanceThreshold: number;
  timestamp: string;
}

/**
 * Whoogle JSON response structure
 */
interface WhoogleResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate: string | null;
}

interface WhoogleResponse {
  success: boolean;
  data: {
    query: string;
    results: WhoogleResult[];
    totalResults: number;
    searchTime: number;
  };
  timestamp: string;
}

@Injectable()
export class WebScraperService {
  private readonly logger = new Logger(WebScraperService.name);
  private readonly whoogleBaseUrl: string;
  private readonly maxResults: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheTTL: number;
  private readonly relevanceThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.whoogleBaseUrl = this.configService.get<string>(
      'WHOOGLE_URL',
      'http://searxng:8080',
    );
    this.maxResults = this.configService.get<number>(
      'WEB_SCRAPER_MAX_RESULTS',
      10,
    );
    this.cacheEnabled = this.configService.get<boolean>(
      'WEB_SCRAPER_CACHE_ENABLED',
      true,
    );
    this.cacheTTL = this.configService.get<number>(
      'WEB_SCRAPER_CACHE_TTL',
      3600,
    );
    this.relevanceThreshold = this.configService.get<number>(
      'WEB_SCRAPER_RELEVANCE_THRESHOLD',
      0.6,
    );
  }

  /**
   * Main scraping method - processes Whoogle JSON search results
   */
  async scrapeSearchResults(
    query: string,
    userId?: string,
  ): Promise<ScraperResponse> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = await this.getCachedScrapedResults(query);
        if (cached) {
          this.logger.debug(`Cache hit for scraped query: ${query}`);
          return cached;
        }
      }

      // Perform search via Whoogle
      const whoogleResponse = await this.performWhoogleSearch(query);

      this.logger.debug('response: ' + whoogleResponse);

      // Validate response
      if (!whoogleResponse.success || !whoogleResponse.data.results) {
        throw new Error('Invalid Whoogle response format');
      }

      // Extract and normalize results
      const scrapedResults = this.extractAndNormalizeResults(
        whoogleResponse.data.results,
        query,
      );

      // Calculate processing statistics
      const stats = this.calculateProcessingStats(scrapedResults);

      const response: ScraperResponse = {
        query,
        results: scrapedResults.slice(0, this.maxResults),
        totalResults: scrapedResults.length,
        scrapingTime: Date.now() - startTime,
        processingStats: stats,
      };

      // Cache results
      if (this.cacheEnabled && scrapedResults.length > 0) {
        await this.cacheScrapedResults(query, response);
      }

      // Log scraping activity
      if (userId) {
        await this.logScrapingActivity(userId, query, scrapedResults.length);
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Web scraping failed for query "${query}": ${error.message}`,
      );
      throw new Error(`Web scraping service failed: ${error.message}`);
    }
  }

  /**
   * Perform Whoogle search and return structured JSON
   */
  private async performWhoogleSearch(query: string): Promise<WhoogleResponse> {
    try {
      this.logger.debug(`Whoogle searching for: ${query}`);

      const response = await firstValueFrom(
        this.httpService.get<WhoogleResponse>(`${this.whoogleBaseUrl}/search`, {
          params: {
            q: query,
            format: 'json',
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'NestJS WebSearchService/1.0',
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Whoogle search failed: ${error.message}`);

      if ((error as any).code === 'ECONNREFUSED') {
        this.logger.warn(
          'Whoogle service unavailable, returning empty results',
        );
        return {
          success: false,
          data: {
            query,
            results: [],
            totalResults: 0,
            searchTime: 0,
          },
          timestamp: new Date().toISOString(),
        };
      }

      throw error;
    }
  }

  /**
   * Extract and normalize Whoogle results into structured format
   */
  private extractAndNormalizeResults(
    whoogleResults: WhoogleResult[],
    query: string,
  ): ScrapedResult[] {
    const queryTerms = this.extractQueryTerms(query);
    const results: ScrapedResult[] = [];

    for (const result of whoogleResults) {
      try {
        // Extract title (before URL in content)
        const title = this.extractTitle(result);

        // Extract URL
        const url = this.extractUrl(result);

        // Extract description (text after URL)
        const description = this.extractDescription(result);

        // Create snippet (first 200 chars of description)
        const snippet = description.substring(0, 200);

        // Skip invalid results
        if (!url || !title) {
          this.logger.warn('Skipping result with missing URL or title');
          continue;
        }

        // Calculate relevance score
        const relevanceScore = this.calculateRelevanceScore(
          title,
          description,
          snippet,
          queryTerms,
          result.score,
        );

        // Extract metadata
        const metadata = this.extractMetadata(url, result.publishedDate);

        results.push({
          title: this.cleanText(title),
          url: this.cleanUrl(url),
          description: this.cleanText(description),
          snippet: this.cleanText(snippet),
          relevanceScore,
          metadata,
        });
      } catch (error) {
        this.logger.warn(`Failed to extract result: ${error.message}`);
      }
    }

    // Sort by relevance score and filter by threshold
    return results
      .filter((r) => r.relevanceScore >= this.relevanceThreshold)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Extract title from Whoogle result
   */
  private extractTitle(result: WhoogleResult): string {
    // Title is before the URL in the content field
    const titleMatch = result.title.match(/^(.+?)\s+https?:\/\//);
    return titleMatch
      ? titleMatch[1].trim()
      : result.title.split('http')[0].trim();
  }

  /**
   * Extract URL from Whoogle result
   */
  private extractUrl(result: WhoogleResult): string {
    // Use the url field if available, otherwise extract from content
    if (result.url) {
      return result.url;
    }

    const urlMatch = result.content.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : '';
  }

  /**
   * Extract description from Whoogle result
   */
  private extractDescription(result: WhoogleResult): string {
    // Description is the text after the URL
    const urlPattern = /https?:\/\/[^\s]+/;
    const parts = result.content.split(urlPattern);

    // Get text after URL, or use the whole content if no URL found
    return parts.length > 1 ? parts[1].trim() : result.content;
  }

  /**
   * Extract metadata from result
   */
  private extractMetadata(
    url: string,
    publishedDate?: string | null,
  ): ScrapedResult['metadata'] {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      return {
        domain,
        publishDate: publishedDate || undefined,
        contentType: this.determineContentType(url),
      };
    } catch (error) {
      this.logger.warn(`Metadata extraction failed: ${error.message}`);
      return { domain: 'unknown' };
    }
  }

  /**
   * Determine content type from URL
   */
  private determineContentType(url: string): string {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('/blog/')) return 'blog';
    if (urlLower.includes('/news/')) return 'news';
    if (urlLower.includes('wikipedia.org')) return 'encyclopedia';
    if (urlLower.includes('.pdf')) return 'pdf';
    if (urlLower.includes('youtube.com') || urlLower.includes('video'))
      return 'video';
    if (urlLower.includes('/forum/') || urlLower.includes('/discuss/'))
      return 'forum';

    return 'article';
  }

  /**
   * Calculate relevance score based on query terms and Whoogle score
   */
  private calculateRelevanceScore(
    title: string,
    description: string,
    snippet: string,
    queryTerms: string[],
    whoogleScore: number,
  ): number {
    let score = whoogleScore; // Start with Whoogle's score

    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const snippetLower = snippet.toLowerCase();

    // Add points for query term matches
    queryTerms.forEach((term) => {
      if (titleLower.includes(term)) score += 0.3;
      if (snippetLower.includes(term)) score += 0.2;
      if (descLower.includes(term)) score += 0.1;
    });

    // Exact phrase match bonus
    const fullQuery = queryTerms.join(' ');
    if (titleLower.includes(fullQuery)) score += 0.3;
    if (descLower.includes(fullQuery)) score += 0.2;

    // Normalize to 0-1 range
    return Math.min(1.0, score);
  }

  /**
   * Extract query terms for matching
   */
  private extractQueryTerms(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2);
  }

  /**
   * Clean URL by removing tracking parameters
   */
  private cleanUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Remove common tracking parameters
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
        'msclkid',
        'mc_cid',
        'mc_eid',
      ];

      trackingParams.forEach((param) => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();
  }

  /**
   * Calculate processing statistics
   */
  private calculateProcessingStats(results: ScrapedResult[]): {
    totalPages: number;
    successfulExtractions: number;
    failedExtractions: number;
    averageRelevanceScore: number;
  } {
    const totalPages = results.length;
    const successfulExtractions = results.filter(
      (r) => r.title && r.url && r.description,
    ).length;
    const failedExtractions = totalPages - successfulExtractions;

    const averageRelevanceScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length
        : 0;

    return {
      totalPages,
      successfulExtractions,
      failedExtractions,
      averageRelevanceScore: parseFloat(averageRelevanceScore.toFixed(3)),
    };
  }

  /**
   * Build enhanced context for AI service
   */
  buildEnhancedContext(
    scraperResponse: ScraperResponse,
    maxResults: number = 5,
  ): EnhancedContext {
    const topResults = scraperResponse.results.slice(0, maxResults);

    const contextSummary = this.generateContextSummary(
      scraperResponse.query,
      topResults,
    );

    const topSources = topResults.map((result) => result.metadata.domain);

    return {
      query: scraperResponse.query,
      searchResults: topResults,
      contextSummary,
      topSources,
      relevanceThreshold: this.relevanceThreshold,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate context summary for AI
   */
  private generateContextSummary(
    query: string,
    results: ScrapedResult[],
  ): string {
    if (results.length === 0) {
      return `No relevant results found for query: "${query}"`;
    }

    const summaryParts = [
      `Search results for: "${query}"`,
      `Found ${results.length} relevant sources:`,
    ];

    results.forEach((result, index) => {
      summaryParts.push(
        `${index + 1}. ${result.title} (${result.metadata.domain})`,
        `   ${result.snippet.substring(0, 150)}...`,
        `   Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`,
      );
    });

    return summaryParts.join('\n');
  }

  /**
   * Format scraped results for AI prompt integration
   */
  formatForAIPrompt(enhancedContext: EnhancedContext): string {
    const { query, searchResults, contextSummary } = enhancedContext;

    const promptParts = [
      '\n[Web Search Results]',
      `Query: "${query}"`,
      `Retrieved: ${new Date(enhancedContext.timestamp).toLocaleString()}`,
      '',
      contextSummary,
      '',
      '[Detailed Results]',
    ];

    searchResults.forEach((result, index) => {
      promptParts.push(
        `[${index + 1}] ${result.title}`,
        `URL: ${result.url}`,
        `Source: ${result.metadata.domain}`,
        `Content: ${result.description}`,
        `Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`,
        '',
      );
    });

    promptParts.push(
      '[Instructions for AI]',
      '- Use these search results to provide accurate, up-to-date information',
      '- Cite sources by referring to their numbered position [1], [2], etc.',
      '- Prioritize results with higher relevance scores',
      '- If information conflicts between sources, note the discrepancy',
      '- Do not fabricate information not present in the search results',
    );

    return promptParts.join('\n');
  }

  /**
   * Cache scraped results
   */
  private async cacheScrapedResults(
    query: string,
    response: ScraperResponse,
  ): Promise<void> {
    try {
      const cacheKey = `scraper:${query.toLowerCase().trim()}`;
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response));
      this.logger.debug(`Cached scraping results for query: ${query}`);
    } catch (error) {
      this.logger.error(`Failed to cache scraping results: ${error.message}`);
    }
  }

  /**
   * Get cached scraped results
   */
  private async getCachedScrapedResults(
    query: string,
  ): Promise<ScraperResponse | null> {
    try {
      const cacheKey = `scraper:${query.toLowerCase().trim()}`;
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
   * Log scraping activity
   */
  private async logScrapingActivity(
    userId: string,
    query: string,
    resultCount: number,
  ): Promise<void> {
    try {
      const logKey = `scraper:logs:${userId}`;
      const logEntry = JSON.stringify({
        query,
        resultCount,
        timestamp: new Date().toISOString(),
      });

      await this.redis.lpush(logKey, logEntry);
      await this.redis.ltrim(logKey, 0, 99);
      await this.redis.expire(logKey, 86400 * 30);
    } catch (error) {
      this.logger.error(`Failed to log scraping activity: ${error.message}`);
    }
  }

  /**
   * Get user scraping statistics
   */
  async getUserScrapingStats(userId: string): Promise<any> {
    try {
      const logKey = `scraper:logs:${userId}`;
      const logs = await this.redis.lrange(logKey, 0, -1);

      const activities = logs.map((log) => JSON.parse(log));

      return {
        totalScrapes: activities.length,
        recentActivities: activities.slice(0, 10),
        averageResults:
          activities.reduce((sum, a) => sum + a.resultCount, 0) /
            activities.length || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get user scraping stats: ${error.message}`);
      return {
        totalScrapes: 0,
        recentActivities: [],
        averageResults: 0,
      };
    }
  }

  /**
   * Health check for scraper service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.whoogleBaseUrl}/`, {
          timeout: 5000,
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.error(`Scraper health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetch deeper page HTML for enrichment (optional utility)
   */
  async fetchPageHtml(url: string): Promise<string | null> {
    try {
      this.logger.debug(`Fetching HTML from: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NestJS/1.0)',
          },
          maxRedirects: 3,
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch page HTML: ${error.message}`);
      return null;
    }
  }
}
