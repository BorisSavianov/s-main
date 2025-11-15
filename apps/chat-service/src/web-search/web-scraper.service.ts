// apps/chat-service/src/web-search/web-scraper.service.ts - ENHANCED VERSION
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as cheerio from 'cheerio';

/**
 * Normalized search result matching required schema
 */
export interface NormalizedSearchResult {
  title: string;
  url: string;
  description: string;
  snippet?: string; // For backward compatibility
  relevanceScore?: number; // For backward compatibility
  metadata: {
    domain: string;
    favicon?: string;
    statusCode?: number;
    timestamp: string;
    publishDate?: string;
    contentType?: string;
  };
  html?: string; // Full fetched HTML content
  extractedContent?: {
    mainText: string;
    metaTitle?: string;
    metaDescription?: string;
    paragraphs: string[];
    headings: string[];
  };
}

/**
 * Raw Whoogle response structure (as received from API)
 */
interface WhoogleRawResult {
  title?: string;
  text?: string;
  content?: string;
  href?: string;
  url?: string;
}

interface WhoogleRawResponse {
  query: string;
  results: WhoogleRawResult[];
  search_type?: string;
}

/**
 * Normalized response matching required schema
 */
export interface NormalizedScraperResponse {
  query: string;
  results: NormalizedSearchResult[];
  search_type: string;
  totalResults: number;
  scrapingTime: number;
  processingStats: {
    totalPages: number;
    successfulExtractions: number;
    failedExtractions: number;
    averageRelevanceScore: number;
    htmlFetchSuccess: number;
    htmlFetchFailed: number;
  };
}

/**
 * Legacy response format (for backward compatibility)
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
  searchResults: NormalizedSearchResult[];
  contextSummary: string;
  topSources: string[];
  relevanceThreshold: number;
  timestamp: string;
  fullTextContent?: string[]; // Extracted text from HTML
}

@Injectable()
export class WebScraperService {
  private readonly logger = new Logger(WebScraperService.name);
  private readonly whoogleBaseUrl: string;
  private readonly maxResults: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheTTL: number;
  private readonly relevanceThreshold: number;
  private readonly htmlFetchEnabled: boolean;
  private readonly htmlFetchTimeout: number;
  private readonly maxRetries: number;

  // Blocklist for safety filtering
  private readonly blockedDomains = new Set([
    'adult-content.com',
    'illegal-site.com',
    // Add more as needed
  ]);

  private readonly blockedKeywords = [
    'explicit',
    'pornography',
    // Add more as needed - only filter if NOT explicitly in query
  ];

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
    this.htmlFetchEnabled = this.configService.get<boolean>(
      'WEB_SCRAPER_HTML_FETCH_ENABLED',
      true,
    );
    this.htmlFetchTimeout = this.configService.get<number>(
      'WEB_SCRAPER_HTML_TIMEOUT',
      8000,
    );
    this.maxRetries = this.configService.get<number>(
      'WEB_SCRAPER_MAX_RETRIES',
      2,
    );
  }

  /**
   * Main scraping method - returns normalized response
   */
  async scrapeSearchResults(
    query: string,
    userId?: string,
  ): Promise<NormalizedScraperResponse> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = await this.getCachedNormalizedResults(query);
        if (cached) {
          this.logger.debug(`Cache hit for query: ${query}`);
          return cached;
        }
      }

      // Perform search via Whoogle
      const rawResponse = await this.performWhoogleSearch(query);

      // Normalize and parse results
      const normalizedResults = await this.normalizeWhoogleResults(
        rawResponse,
        query,
      );

      // Filter and deduplicate
      const filteredResults = this.deduplicateResults(
        this.filterInvalidResults(normalizedResults, query),
      );

      // Fetch HTML content if enabled
      if (this.htmlFetchEnabled) {
        await this.enrichResultsWithHTML(filteredResults);
      }

      // Calculate processing stats
      const stats = this.calculateEnhancedStats(
        filteredResults,
        normalizedResults.length,
      );

      const response: NormalizedScraperResponse = {
        query,
        results: filteredResults.slice(0, this.maxResults),
        search_type: 'web',
        totalResults: filteredResults.length,
        scrapingTime: Date.now() - startTime,
        processingStats: stats,
      };

      // Cache results
      if (this.cacheEnabled && filteredResults.length > 0) {
        await this.cacheNormalizedResults(query, response);
      }

      // Log activity
      if (userId) {
        await this.logScrapingActivity(userId, query, filteredResults.length);
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
   * Legacy method for backward compatibility
   */
  async scrapeSearchResultsLegacy(
    query: string,
    userId?: string,
  ): Promise<ScraperResponse> {
    const normalizedResponse = await this.scrapeSearchResults(query, userId);

    // Convert to legacy format
    return {
      query: normalizedResponse.query,
      results: normalizedResponse.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
        snippet: r.snippet || r.description.substring(0, 200),
        relevanceScore: r.relevanceScore || 0.8,
        metadata: {
          domain: r.metadata.domain,
          publishDate: r.metadata.publishDate,
          contentType: r.metadata.contentType,
        },
      })),
      totalResults: normalizedResponse.totalResults,
      scrapingTime: normalizedResponse.scrapingTime,
      processingStats: {
        totalPages: normalizedResponse.processingStats.totalPages,
        successfulExtractions:
          normalizedResponse.processingStats.successfulExtractions,
        failedExtractions: normalizedResponse.processingStats.failedExtractions,
        averageRelevanceScore:
          normalizedResponse.processingStats.averageRelevanceScore,
      },
    };
  }

  /**
   * Perform Whoogle search with proper error handling
   */
  private async performWhoogleSearch(
    query: string,
  ): Promise<WhoogleRawResponse> {
    try {
      this.logger.debug(`Performing Whoogle search for: ${query}`);

      const response = await firstValueFrom(
        this.httpService.get(`${this.whoogleBaseUrl}/search`, {
          params: {
            q: query,
            format: 'json',
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'NestJS WebSearchService/2.0',
          },
        }),
      );

      const data = response.data as any;

      // Validate response structure
      if (!data || !data.results || !Array.isArray(data.results)) {
        this.logger.warn('Invalid Whoogle response format');
        return {
          query,
          results: [],
          search_type: 'web',
        };
      }

      return {
        query: data.query || query,
        results: data.results,
        search_type: data.search_type || 'web',
      };
    } catch (error) {
      this.logger.error(`Whoogle search failed: ${error.message}`);

      if ((error as any).code === 'ECONNREFUSED') {
        this.logger.warn(
          'Whoogle service unavailable, returning empty results',
        );
        return {
          query,
          results: [],
          search_type: 'web',
        };
      }

      throw error;
    }
  }

  /**
   * Normalize raw Whoogle results into clean, consistent format
   */
  private async normalizeWhoogleResults(
    rawResponse: WhoogleRawResponse,
    query: string,
  ): Promise<NormalizedSearchResult[]> {
    const queryTerms = this.extractQueryTerms(query);
    const results: NormalizedSearchResult[] = [];

    for (const raw of rawResponse.results) {
      try {
        // Extract and clean fields from malformed Whoogle response
        const title = this.extractTitle(raw);
        const url = this.extractUrl(raw);
        const description = this.extractDescription(raw);

        // Skip if essential fields missing
        if (!url || !title) {
          this.logger.warn('Skipping result with missing URL or title');
          continue;
        }

        // Canonicalize URL
        const canonicalUrl = this.canonicalizeUrl(url);

        // Calculate relevance score
        const relevanceScore = this.calculateRelevanceScore(
          title,
          description,
          queryTerms,
        );

        // Extract metadata
        const metadata = this.extractEnhancedMetadata(canonicalUrl);

        results.push({
          title: this.cleanText(title),
          url: canonicalUrl,
          description: this.cleanText(description),
          snippet: this.cleanText(description.substring(0, 200)),
          relevanceScore,
          metadata,
        });
      } catch (error) {
        this.logger.warn(`Failed to normalize result: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Extract title from malformed Whoogle result
   */
  private extractTitle(raw: WhoogleRawResult): string {
    // Priority: title > text (before URL) > content (before URL)
    if (raw.title) {
      return raw.title.split('http')[0].trim();
    }

    if (raw.text) {
      const match = raw.text.match(/^(.+?)\s+https?:\/\//);
      if (match) return match[1].trim();
      return raw.text.split('http')[0].trim();
    }

    if (raw.content) {
      return raw.content.split('http')[0].trim();
    }

    return 'Untitled';
  }

  /**
   * Extract URL from malformed Whoogle result
   */
  private extractUrl(raw: WhoogleRawResult): string {
    // Priority: href > url > extracted from text/content
    if (raw.href) return raw.href;
    if (raw.url) return raw.url;

    // Try to extract from text or content
    const text = raw.text || raw.content || '';
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : '';
  }

  /**
   * Extract description from malformed Whoogle result
   */
  private extractDescription(raw: WhoogleRawResult): string {
    // Priority: content (after URL) > text (after URL)
    const textToProcess = raw.content || raw.text || '';

    // Remove URL and everything before it
    const urlPattern = /https?:\/\/[^\s]+/;
    const parts = textToProcess.split(urlPattern);

    // Get text after URL
    const description = parts.length > 1 ? parts[1].trim() : textToProcess;

    return description || 'No description available';
  }

  /**
   * Canonicalize URL (remove tracking params, normalize)
   */
  private canonicalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Remove tracking parameters
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
        '_ga',
        '_gid',
      ];

      trackingParams.forEach((param) => {
        urlObj.searchParams.delete(param);
      });

      // Normalize: lowercase protocol and domain
      urlObj.protocol = urlObj.protocol.toLowerCase();
      urlObj.hostname = urlObj.hostname.toLowerCase();

      // Remove trailing slash if no path
      let finalUrl = urlObj.toString();
      if (urlObj.pathname === '/' && !urlObj.search && !urlObj.hash) {
        finalUrl = finalUrl.replace(/\/$/, '');
      }

      return finalUrl;
    } catch (error) {
      return url;
    }
  }

  /**
   * Extract enhanced metadata
   */
  private extractEnhancedMetadata(
    url: string,
  ): NormalizedSearchResult['metadata'] {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      return {
        domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}`,
        timestamp: new Date().toISOString(),
        contentType: this.determineContentType(url),
      };
    } catch (error) {
      return {
        domain: 'unknown',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Determine content type from URL patterns
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
   * Filter invalid and unsafe results
   */
  private filterInvalidResults(
    results: NormalizedSearchResult[],
    query: string,
  ): NormalizedSearchResult[] {
    const queryLower = query.toLowerCase();
    const explicitSearch = this.blockedKeywords.some((kw) =>
      queryLower.includes(kw),
    );

    return results.filter((result) => {
      // Check if URL is valid
      try {
        new URL(result.url);
      } catch {
        return false;
      }

      // Check blocked domains
      if (this.blockedDomains.has(result.metadata.domain)) {
        return false;
      }

      // Safety filter (unless explicit search)
      if (!explicitSearch) {
        const contentLower =
          `${result.title} ${result.description}`.toLowerCase();
        if (this.blockedKeywords.some((kw) => contentLower.includes(kw))) {
          return false;
        }
      }

      // Check relevance threshold
      if (
        result.relevanceScore &&
        result.relevanceScore < this.relevanceThreshold
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Deduplicate results by URL
   */
  private deduplicateResults(
    results: NormalizedSearchResult[],
  ): NormalizedSearchResult[] {
    const seen = new Set<string>();
    return results.filter((result) => {
      const normalized = result.url.replace(/\/$/, '').toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  /**
   * Enrich results with fetched HTML content
   */
  private async enrichResultsWithHTML(
    results: NormalizedSearchResult[],
  ): Promise<void> {
    const fetchPromises = results.map((result) =>
      this.fetchAndExtractHTML(result),
    );

    await Promise.allSettled(fetchPromises);
  }

  /**
   * Fetch HTML and extract content with retry logic
   */
  private async fetchAndExtractHTML(
    result: NormalizedSearchResult,
  ): Promise<void> {
    let lastError: any;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const html = await this.fetchPageHTML(result.url);

        if (html) {
          result.html = html;
          result.extractedContent = this.extractContentFromHTML(html);
          result.metadata.statusCode = 200;
          return;
        }
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `HTML fetch attempt ${attempt + 1} failed for ${result.url}: ${error.message}`,
        );

        if (attempt < this.maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
        }
      }
    }

    this.logger.error(
      `Failed to fetch HTML for ${result.url} after ${this.maxRetries} attempts`,
    );
    result.metadata.statusCode = 0;
  }

  /**
   * Fetch page HTML with timeout
   */
  private async fetchPageHTML(url: string): Promise<string | null> {
    try {
      this.logger.debug(`Fetching HTML from: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: this.htmlFetchTimeout,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          maxRedirects: 3,
          validateStatus: (status) => status < 400,
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch HTML: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract structured content from HTML using cheerio
   */
  private extractContentFromHTML(
    html: string,
  ): NormalizedSearchResult['extractedContent'] {
    try {
      const $ = cheerio.load(html);

      // Remove script and style tags
      $('script, style, noscript, iframe').remove();

      // Extract meta information
      const metaTitle =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text() ||
        '';

      const metaDescription =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        '';

      // Extract paragraphs
      const paragraphs: string[] = [];
      $('p').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 50) {
          // Only meaningful paragraphs
          paragraphs.push(text);
        }
      });

      // Extract headings
      const headings: string[] = [];
      $('h1, h2, h3, h4').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text) {
          headings.push(text);
        }
      });

      // Extract main text (fallback if no paragraphs)
      let mainText = paragraphs.join('\n\n');
      if (!mainText) {
        mainText = $('body').text().replace(/\s+/g, ' ').trim();
      }

      return {
        mainText: mainText.substring(0, 5000), // Limit to 5000 chars
        metaTitle: this.cleanText(metaTitle),
        metaDescription: this.cleanText(metaDescription),
        paragraphs: paragraphs.slice(0, 10), // First 10 paragraphs
        headings: headings.slice(0, 20), // First 20 headings
      };
    } catch (error) {
      this.logger.error(`Content extraction failed: ${error.message}`);
      return {
        mainText: '',
        paragraphs: [],
        headings: [],
      };
    }
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(
    title: string,
    description: string,
    queryTerms: string[],
  ): number {
    let score = 0.5; // Base score

    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const fullQuery = queryTerms.join(' ');

    // Term matching
    queryTerms.forEach((term) => {
      if (titleLower.includes(term)) score += 0.2;
      if (descLower.includes(term)) score += 0.1;
    });

    // Exact phrase match bonus
    if (titleLower.includes(fullQuery)) score += 0.3;
    if (descLower.includes(fullQuery)) score += 0.15;

    return Math.min(1.0, score);
  }

  /**
   * Extract query terms
   */
  private extractQueryTerms(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2);
  }

  /**
   * Clean text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  /**
   * Calculate enhanced processing stats
   */
  private calculateEnhancedStats(
    processedResults: NormalizedSearchResult[],
    originalCount: number,
  ): NormalizedScraperResponse['processingStats'] {
    const successfulExtractions = processedResults.filter(
      (r) => r.title && r.url && r.description,
    ).length;

    const htmlFetchSuccess = processedResults.filter(
      (r) => r.html && r.metadata.statusCode === 200,
    ).length;

    const htmlFetchFailed = processedResults.filter(
      (r) => r.metadata.statusCode === 0,
    ).length;

    const avgRelevance =
      processedResults.length > 0
        ? processedResults.reduce(
            (sum, r) => sum + (r.relevanceScore || 0),
            0,
          ) / processedResults.length
        : 0;

    return {
      totalPages: originalCount,
      successfulExtractions,
      failedExtractions: originalCount - successfulExtractions,
      averageRelevanceScore: parseFloat(avgRelevance.toFixed(3)),
      htmlFetchSuccess,
      htmlFetchFailed,
    };
  }

  /**
   * Build enhanced context for AI service
   */
  buildEnhancedContext(
    response: NormalizedScraperResponse,
    maxResults: number = 5,
  ): EnhancedContext {
    const topResults = response.results.slice(0, maxResults);

    const contextSummary = this.generateContextSummary(
      response.query,
      topResults,
    );

    const fullTextContent = topResults
      .filter((r) => r.extractedContent?.mainText)
      .map((r) => r.extractedContent!.mainText);

    return {
      query: response.query,
      searchResults: topResults,
      contextSummary,
      topSources: topResults.map((r) => r.metadata.domain),
      relevanceThreshold: this.relevanceThreshold,
      timestamp: new Date().toISOString(),
      fullTextContent,
    };
  }

  /**
   * Generate context summary
   */
  private generateContextSummary(
    query: string,
    results: NormalizedSearchResult[],
  ): string {
    if (results.length === 0) {
      return `No relevant results found for query: "${query}"`;
    }

    const summaryParts = [
      `Search results for: "${query}"`,
      `Found ${results.length} relevant sources:`,
      '',
    ];

    results.forEach((result, index) => {
      summaryParts.push(
        `[${index + 1}] ${result.title} (${result.metadata.domain})`,
        `   ${result.description.substring(0, 150)}...`,
        `   Relevance: ${((result.relevanceScore || 0) * 100).toFixed(0)}%`,
      );

      // Add extracted content preview if available
      if (result.extractedContent?.mainText) {
        summaryParts.push(
          `   Content Preview: ${result.extractedContent.mainText.substring(0, 200)}...`,
        );
      }

      summaryParts.push('');
    });

    return summaryParts.join('\n');
  }

  /**
   * Format for AI prompt with enhanced content
   */
  formatForAIPrompt(enhancedContext: EnhancedContext): string {
    const { query, searchResults, contextSummary, fullTextContent } =
      enhancedContext;

    const promptParts = [
      '\n[Web Search Results]',
      `Query: "${query}"`,
      `Retrieved: ${new Date(enhancedContext.timestamp).toLocaleString()}`,
      '',
      contextSummary,
      '',
      '[Detailed Results with Extracted Content]',
    ];

    searchResults.forEach((result, index) => {
      promptParts.push(
        `[${index + 1}] ${result.title}`,
        `URL: ${result.url}`,
        `Source: ${result.metadata.domain}`,
        `Description: ${result.description}`,
        `Relevance: ${((result.relevanceScore || 0) * 100).toFixed(0)}%`,
      );

      if (result.extractedContent) {
        promptParts.push(
          `Meta Title: ${result.extractedContent.metaTitle || 'N/A'}`,
          `Meta Description: ${result.extractedContent.metaDescription || 'N/A'}`,
        );

        if (result.extractedContent.headings.length > 0) {
          promptParts.push(
            `Key Headings: ${result.extractedContent.headings.slice(0, 5).join(', ')}`,
          );
        }

        if (result.extractedContent.mainText) {
          promptParts.push(
            `Full Content Extract:`,
            result.extractedContent.mainText.substring(0, 1000) + '...',
          );
        }
      }

      promptParts.push('');
    });

    promptParts.push(
      '[Instructions for AI]',
      '- Use these search results and extracted content to provide accurate, up-to-date information',
      '- Cite sources by referring to their numbered position [1], [2], etc.',
      '- Prioritize results with higher relevance scores',
      '- Use the extracted full content when available for more detailed answers',
      '- If information conflicts between sources, note the discrepancy',
      '- Do not fabricate information not present in the search results',
    );

    return promptParts.join('\n');
  }

  /**
   * Cache normalized results
   */
  private async cacheNormalizedResults(
    query: string,
    response: NormalizedScraperResponse,
  ): Promise<void> {
    try {
      const cacheKey = `scraper:v2:${query.toLowerCase().trim()}`;
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response));
      this.logger.debug(`Cached normalized results for query: ${query}`);
    } catch (error) {
      this.logger.error(`Failed to cache results: ${error.message}`);
    }
  }

  /**
   * Get cached normalized results
   */
  private async getCachedNormalizedResults(
    query: string,
  ): Promise<NormalizedScraperResponse | null> {
    try {
      const cacheKey = `scraper:v2:${query.toLowerCase().trim()}`;
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
}
