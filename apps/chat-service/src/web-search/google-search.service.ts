// apps/chat-service/src/web-search/google-search.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * Google Custom Search API Response Interfaces
 */
interface GoogleSearchItem {
  kind: string;
  title: string;
  htmlTitle: string;
  link: string;
  displayLink: string;
  snippet: string;
  htmlSnippet: string;
  cacheId?: string;
  formattedUrl: string;
  htmlFormattedUrl: string;
  pagemap?: {
    metatags?: Array<{
      [key: string]: string;
    }>;
    cse_thumbnail?: Array<{
      src: string;
      width: string;
      height: string;
    }>;
    cse_image?: Array<{
      src: string;
    }>;
  };
  mime?: string;
  fileFormat?: string;
}

interface GoogleSearchResponse {
  kind: string;
  url: {
    type: string;
    template: string;
  };
  queries: {
    request: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
      inputEncoding: string;
      outputEncoding: string;
      safe: string;
      cx: string;
    }>;
    nextPage?: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
      inputEncoding: string;
      outputEncoding: string;
      safe: string;
      cx: string;
    }>;
  };
  context: {
    title: string;
  };
  searchInformation: {
    searchTime: number;
    formattedSearchTime: string;
    totalResults: string;
    formattedTotalResults: string;
  };
  items?: GoogleSearchItem[];
}

/**
 * Normalized search result matching the existing schema
 */
export interface NormalizedGoogleResult {
  title: string;
  url: string;
  description: string;
  snippet?: string;
  relevanceScore?: number;
  metadata: {
    domain: string;
    favicon?: string;
    statusCode?: number;
    timestamp: string;
    publishDate?: string;
    contentType?: string;
  };
}

export interface GoogleSearchServiceResponse {
  query: string;
  results: NormalizedGoogleResult[];
  totalResults: number;
  searchTime: number;
  nextPageToken?: number;
}

@Injectable()
export class GoogleSearchService {
  private readonly logger = new Logger(GoogleSearchService.name);
  private readonly apiKey: string;
  private readonly searchEngineId: string;
  private readonly baseUrl = 'https://www.googleapis.com/customsearch/v1';
  private readonly maxResults: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheTTL: number;
  private readonly maxRetries: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.apiKey = this.configService.get<string>(
      'GOOGLE_CUSTOM_SEARCH_API_KEY',
      '',
    );
    this.searchEngineId = this.configService.get<string>(
      'GOOGLE_CUSTOM_SEARCH_ENGINE_ID',
      '',
    );
    this.maxResults = this.configService.get<number>(
      'WEB_SEARCH_MAX_RESULTS',
      10,
    );
    this.cacheEnabled = this.configService.get<boolean>(
      'WEB_SEARCH_CACHE_ENABLED',
      true,
    );
    this.cacheTTL = this.configService.get<number>(
      'WEB_SEARCH_CACHE_TTL',
      3600,
    );
    this.maxRetries = this.configService.get<number>(
      'GOOGLE_SEARCH_MAX_RETRIES',
      2,
    );

    if (!this.apiKey || !this.searchEngineId) {
      this.logger.warn(
        'Google Custom Search API credentials not configured. Search functionality will be limited.',
      );
    }
  }

  /**
   * Perform Google Custom Search with retry logic
   */
  async search(
    query: string,
    options: {
      start?: number;
      num?: number;
      dateRestrict?: string;
      siteSearch?: string;
      exactTerms?: string;
    } = {},
  ): Promise<GoogleSearchServiceResponse> {
    const startTime = Date.now();

    try {
      // Validate credentials
      if (!this.apiKey || !this.searchEngineId) {
        throw new HttpException(
          'Google Custom Search API not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Check cache first
      if (this.cacheEnabled) {
        const cached = await this.getCachedResults(query, options);
        if (cached) {
          this.logger.debug(`Cache hit for Google search: ${query}`);
          return cached;
        }
      }

      // Perform search with retry
      const response = await this.performSearchWithRetry(query, options);

      // Normalize results
      const normalizedResults = this.normalizeResults(response);

      const searchResponse: GoogleSearchServiceResponse = {
        query,
        results: normalizedResults,
        totalResults: parseInt(
          response.searchInformation?.totalResults || '0',
          10,
        ),
        searchTime: Date.now() - startTime,
        nextPageToken: response.queries?.nextPage?.[0]?.startIndex,
      };

      // Cache results
      if (this.cacheEnabled && normalizedResults.length > 0) {
        await this.cacheResults(query, options, searchResponse);
      }

      return searchResponse;
    } catch (error) {
      this.logger.error(
        `Google Custom Search failed for query "${query}": ${error.message}`,
      );

      // Handle specific error cases
      if (error.response?.status === 429) {
        throw new HttpException(
          'Google API quota exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (error.response?.status === 403) {
        throw new HttpException(
          'Google API access forbidden. Check API key and permissions.',
          HttpStatus.FORBIDDEN,
        );
      }

      throw new HttpException(
        'Web search service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Perform search with exponential backoff retry
   */
  private async performSearchWithRetry(
    query: string,
    options: any,
    attempt: number = 0,
  ): Promise<GoogleSearchResponse> {
    try {
      const params: any = {
        key: this.apiKey,
        cx: this.searchEngineId,
        q: query,
        num: Math.min(options.num || this.maxResults, 10), // Google max is 10 per request
        start: options.start || 1,
      };

      // Add optional parameters
      if (options.dateRestrict) params.dateRestrict = options.dateRestrict;
      if (options.siteSearch) params.siteSearch = options.siteSearch;
      if (options.exactTerms) params.exactTerms = options.exactTerms;

      this.logger.debug(
        `Performing Google Custom Search: ${query} (attempt ${attempt + 1})`,
      );

      const response = await firstValueFrom(
        this.httpService.get<GoogleSearchResponse>(this.baseUrl, {
          params,
          timeout: 10000,
          headers: {
            'User-Agent': 'NestJS GoogleSearchService/1.0',
            Accept: 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      // Retry on network errors or 5xx errors
      const shouldRetry =
        attempt < this.maxRetries &&
        (error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          (error.response?.status >= 500 && error.response?.status < 600));

      if (shouldRetry) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        this.logger.warn(
          `Google search attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.performSearchWithRetry(query, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Normalize Google search results to match existing schema
   */
  private normalizeResults(
    response: GoogleSearchResponse,
  ): NormalizedGoogleResult[] {
    if (!response.items || response.items.length === 0) {
      return [];
    }

    return response.items.map((item, index) => {
      // Extract domain from URL
      let domain = 'unknown';
      try {
        const url = new URL(item.link);
        domain = url.hostname.replace('www.', '');
      } catch (e) {
        this.logger.warn(`Invalid URL in search result: ${item.link}`);
      }

      // Extract publish date from pagemap metatags if available
      let publishDate: string | undefined;
      if (item.pagemap?.metatags && item.pagemap.metatags.length > 0) {
        const metatags = item.pagemap.metatags[0];
        publishDate =
          metatags['article:published_time'] ||
          metatags['datePublished'] ||
          metatags['pubdate'];
      }

      // Determine content type
      const contentType = this.determineContentType(item);

      // Calculate relevance score based on position (higher position = higher score)
      const relevanceScore = Math.max(0.5, 1 - index * 0.05);

      return {
        title: this.cleanHtmlEntities(item.title),
        url: item.link,
        description: this.cleanHtmlEntities(item.snippet),
        snippet: this.cleanHtmlEntities(item.snippet.substring(0, 200)),
        relevanceScore,
        metadata: {
          domain,
          favicon: `https://www.google.com/s2/favicons?domain=${domain}`,
          timestamp: new Date().toISOString(),
          publishDate,
          contentType,
        },
      };
    });
  }

  /**
   * Determine content type from Google search result
   */
  private determineContentType(item: GoogleSearchItem): string {
    const url = item.link.toLowerCase();
    const title = item.title.toLowerCase();

    // Check file format first
    if (item.fileFormat) {
      return item.fileFormat.toLowerCase();
    }

    // Check URL patterns
    if (url.includes('/blog/')) return 'blog';
    if (url.includes('/news/')) return 'news';
    if (url.includes('wikipedia.org')) return 'encyclopedia';
    if (url.endsWith('.pdf')) return 'pdf';
    if (url.includes('youtube.com') || url.includes('video')) return 'video';
    if (url.includes('/forum/') || url.includes('/discuss/')) return 'forum';

    // Check title patterns
    if (title.includes('blog')) return 'blog';
    if (title.includes('news')) return 'news';
    if (title.includes('forum')) return 'forum';

    return 'article';
  }

  /**
   * Clean HTML entities from text
   */
  private cleanHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, '') // Remove any HTML tags
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Cache search results
   */
  private async cacheResults(
    query: string,
    options: any,
    response: GoogleSearchServiceResponse,
  ): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(query, options);
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response));
      this.logger.debug(`Cached Google search results for: ${query}`);
    } catch (error) {
      this.logger.error(`Failed to cache search results: ${error.message}`);
    }
  }

  /**
   * Get cached search results
   */
  private async getCachedResults(
    query: string,
    options: any,
  ): Promise<GoogleSearchServiceResponse | null> {
    try {
      const cacheKey = this.buildCacheKey(query, options);
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
   * Build cache key from query and options
   */
  private buildCacheKey(query: string, options: any): string {
    const optionsStr = JSON.stringify(options);
    return `google-search:${query.toLowerCase().trim()}:${optionsStr}`;
  }

  /**
   * Health check for Google Custom Search API
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.apiKey || !this.searchEngineId) {
        return false;
      }

      // Perform a minimal test search
      const response = await firstValueFrom(
        this.httpService.get(this.baseUrl, {
          params: {
            key: this.apiKey,
            cx: this.searchEngineId,
            q: 'test',
            num: 1,
          },
          timeout: 5000,
        }),
      );

      return response.status === 200;
    } catch (error) {
      this.logger.error(`Google API health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get API usage statistics (if available from response headers)
   */
  getApiInfo(): {
    configured: boolean;
    apiKey: string;
    searchEngineId: string;
  } {
    return {
      configured: !!(this.apiKey && this.searchEngineId),
      apiKey: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'not set',
      searchEngineId: this.searchEngineId || 'not set',
    };
  }
}
