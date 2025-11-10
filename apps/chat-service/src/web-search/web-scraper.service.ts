// // apps/chat-service/src/web-search/web-scraper.service.ts
// import { Injectable, Logger } from '@nestjs/common';
// import { HttpService } from '@nestjs/axios';
// import { ConfigService } from '@nestjs/config';
// import { firstValueFrom } from 'rxjs';
// import * as cheerio from 'cheerio';
// import { InjectRedis } from '@nestjs-modules/ioredis';
// import Redis from 'ioredis';

// export interface ScrapedResult {
//   title: string;
//   url: string;
//   description: string;
//   snippet: string;
//   relevanceScore: number;
//   metadata?: {
//     domain: string;
//     publishDate?: string;
//     author?: string;
//     keywords?: string[];
//     contentType?: string;
//   };
// }

// export interface ScraperResponse {
//   query: string;
//   results: ScrapedResult[];
//   totalResults: number;
//   scrapingTime: number;
//   processingStats: {
//     totalPages: number;
//     successfulExtractions: number;
//     failedExtractions: number;
//     averageRelevanceScore: number;
//   };
// }

// export interface EnhancedContext {
//   query: string;
//   searchResults: ScrapedResult[];
//   contextSummary: string;
//   topSources: string[];
//   relevanceThreshold: number;
//   timestamp: string;
// }

// interface SearchResult {
//   title: string;
//   url: string;
//   content: string;
//   score: number;
//   publishedDate?: string;
// }

// export interface SearchResponse {
//   query: string;
//   results: SearchResult[];
//   totalResults: number;
//   searchTime: number;
// }

// @Injectable()
// export class WebScraperService {
//   private readonly logger = new Logger(WebScraperService.name);
//   private readonly whoogleBaseUrl: string;
//   private readonly maxResults: number;
//   private readonly cacheEnabled: boolean;
//   private readonly cacheTTL: number;
//   private readonly relevanceThreshold: number;

//   constructor(
//     private readonly configService: ConfigService,
//     private readonly httpService: HttpService,
//     @InjectRedis() private readonly redis: Redis,
//   ) {
//     this.whoogleBaseUrl = this.configService.get<string>(
//       'WHOOGLE_URL',
//       'http://searxng:8080',
//     );
//     this.maxResults = this.configService.get<number>(
//       'WEB_SCRAPER_MAX_RESULTS',
//       10,
//     );
//     this.cacheEnabled = this.configService.get<boolean>(
//       'WEB_SCRAPER_CACHE_ENABLED',
//       true,
//     );
//     this.cacheTTL = this.configService.get<number>(
//       'WEB_SCRAPER_CACHE_TTL',
//       3600,
//     );
//     this.relevanceThreshold = this.configService.get<number>(
//       'WEB_SCRAPER_RELEVANCE_THRESHOLD',
//       0.6,
//     );
//   }

//   /**
//    * Main scraping method that processes Whoogle search results
//    */
//   async scrapeSearchResults(
//     query: string,
//     userId?: string,
//   ): Promise<ScraperResponse> {
//     const startTime = Date.now();

//     try {
//       // Check cache first
//       if (this.cacheEnabled) {
//         const cached = await this.getCachedScrapedResults(query);
//         if (cached) {
//           this.logger.debug(`Cache hit for scraped query: ${query}`);
//           return cached;
//         }
//       }

//       // Perform search via Whoogle
//       const searchResults = await this.performWhoogleSearch(query);

//       // Extract and process results
//       const scrapedResults = await this.extractAndProcessResults(
//         searchResults,
//         query,
//       );

//       // Calculate processing statistics
//       const stats = this.calculateProcessingStats(scrapedResults);

//       const response: ScraperResponse = {
//         query,
//         results: scrapedResults.slice(0, this.maxResults),
//         totalResults: scrapedResults.length,
//         scrapingTime: Date.now() - startTime,
//         processingStats: stats,
//       };

//       // Cache results
//       if (this.cacheEnabled && scrapedResults.length > 0) {
//         await this.cacheScrapedResults(query, response);
//       }

//       // Log scraping activity
//       if (userId) {
//         await this.logScrapingActivity(userId, query, scrapedResults.length);
//       }

//       return response;
//     } catch (error) {
//       this.logger.error(
//         `Web scraping failed for query "${query}": ${error.message}`,
//       );
//       throw new Error(`Web scraping service failed: ${error.message}`);
//     }
//   }

//   /**
//    * Perform Whoogle search and return raw HTML
//    */
//   private async performWhoogleSearch(query: string): Promise<SearchResult[]> {
//     try {
//       this.logger.debug(`Whoogle searching for: ${query}`);

//       const response = await firstValueFrom(
//         this.httpService.get(`${this.whoogleBaseUrl}/search`, {
//           params: {
//             q: query,
//             format: 'json',
//           },
//           timeout: 10000,
//           headers: {
//             'User-Agent': 'NestJS WebSearchService/1.0',
//           },
//         }),
//       );

//       const data = response.data;

//       if (!data || !data.results || !Array.isArray(data.results)) {
//         this.logger.warn(`Invalid Whoogle response format`);
//         return [];
//       }

//       // Transform Whoogle response structure
//       return data.results.map((result: any, index: number) => ({
//         title: result.text || 'Untitled',
//         url: result.href || '',
//         content: result.text || '',
//         score: 1 - index * 0.1, // simple relevance fallback
//         publishedDate: result.publishedDate || null,
//       }));
//     } catch (error) {
//       this.logger.error(`Whoogle search failed: ${error.message}`);

//       if ((error as any).code === 'ECONNREFUSED') {
//         this.logger.warn(
//           'Whoogle service unavailable, returning empty results',
//         );
//         return [];
//       }

//       throw error;
//     }
//   }

//   /**
//    * Extract and process search results from HTML
//    */
//   private async extractAndProcessResults(
//     html: SearchResult[],
//     query: string,
//   ): Promise<ScrapedResult[]> {
//     const $ = cheerio.load(html);
//     const results: ScrapedResult[] = [];
//     const queryTerms = this.extractQueryTerms(query);

//     // Parse search results from Whoogle HTML structure
//     $('.result').each((index, element) => {
//       try {
//         const $result = $(element);

//         // Extract basic information
//         const title =
//           $result.find('.result-title').text().trim() ||
//           $result.find('h3').text().trim() ||
//           'Untitled';

//         const url = $result.find('a').first().attr('href') || '';

//         const description =
//           $result.find('.result-description').text().trim() ||
//           $result.find('.result-content').text().trim() ||
//           $result.find('p').first().text().trim() ||
//           '';

//         // Extract snippet (highlighted text or first paragraph)
//         const snippet = this.extractSnippet($result, description);

//         // Skip invalid results
//         if (!url || !title) {
//           this.logger.warn('No url or title');
//           return;
//         }

//         // Calculate relevance score
//         const relevanceScore = this.calculateRelevanceScore(
//           title,
//           description,
//           snippet,
//           queryTerms,
//         );

//         // Extract metadata
//         const metadata = this.extractMetadata($result, url);

//         results.push({
//           title,
//           url: this.cleanUrl(url),
//           description: this.cleanText(description),
//           snippet: this.cleanText(snippet),
//           relevanceScore,
//           metadata,
//         });
//       } catch (error) {
//         this.logger.warn(`Failed to extract result ${index}: ${error.message}`);
//       }
//     });

//     // Sort by relevance score
//     return results
//       .filter((r) => r.relevanceScore >= this.relevanceThreshold)
//       .sort((a, b) => b.relevanceScore - a.relevanceScore);
//   }

//   /**
//    * Extract snippet from result element
//    */
//   private extractSnippet(
//     $result: cheerio.Cheerio<any>,
//     description: string,
//   ): string {
//     // Try to find highlighted text
//     const highlighted = $result.find('em, b, strong').text().trim();
//     if (highlighted) {
//       return highlighted;
//     }

//     // Use first 200 characters of description
//     return description.substring(0, 200);
//   }

//   /**
//    * Extract metadata from result
//    */
//   private extractMetadata(
//     $result: cheerio.Cheerio<any>,
//     url: string,
//   ): ScrapedResult['metadata'] {
//     try {
//       const domain = new URL(url).hostname;

//       // Extract publish date if available
//       const publishDate = $result.find('.date, .published, time').text().trim();

//       // Extract author if available
//       const author = $result.find('.author, .by').text().trim();

//       // Extract keywords from meta tags or content
//       const keywords = this.extractKeywords($result);

//       // Determine content type
//       const contentType = this.determineContentType(url, $result);

//       return {
//         domain,
//         publishDate: publishDate || undefined,
//         author: author || undefined,
//         keywords: keywords.length > 0 ? keywords : undefined,
//         contentType,
//       };
//     } catch (error) {
//       this.logger.warn(`Metadata extraction failed: ${error.message}`);
//       return { domain: 'unknown' };
//     }
//   }

//   /**
//    * Extract keywords from content
//    */
//   private extractKeywords($result: cheerio.Cheerio<any>): string[] {
//     const text = $result.text().toLowerCase();
//     const words = text.split(/\s+/);

//     // Common stop words to filter out
//     const stopWords = new Set([
//       'the',
//       'be',
//       'to',
//       'of',
//       'and',
//       'a',
//       'in',
//       'that',
//       'have',
//       'i',
//       'it',
//       'for',
//       'not',
//       'on',
//       'with',
//       'he',
//       'as',
//       'you',
//       'do',
//       'at',
//       'this',
//       'but',
//       'his',
//       'by',
//       'from',
//     ]);

//     // Count word frequencies
//     const wordFreq = new Map<string, number>();
//     words.forEach((word) => {
//       const cleaned = word.replace(/[^\w]/g, '');
//       if (cleaned.length > 3 && !stopWords.has(cleaned)) {
//         wordFreq.set(cleaned, (wordFreq.get(cleaned) || 0) + 1);
//       }
//     });

//     // Return top 5 keywords
//     return Array.from(wordFreq.entries())
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 5)
//       .map(([word]) => word);
//   }

//   /**
//    * Determine content type from URL and content
//    */
//   private determineContentType(
//     url: string,
//     $result: cheerio.Cheerio<any>,
//   ): string {
//     const urlLower = url.toLowerCase();
//     const text = $result.text().toLowerCase();

//     if (urlLower.includes('/blog/') || text.includes('posted on')) {
//       return 'blog';
//     }
//     if (urlLower.includes('/news/') || text.includes('breaking news')) {
//       return 'news';
//     }
//     if (urlLower.includes('wikipedia.org')) {
//       return 'encyclopedia';
//     }
//     if (urlLower.includes('.pdf')) {
//       return 'pdf';
//     }
//     if (urlLower.includes('youtube.com') || urlLower.includes('video')) {
//       return 'video';
//     }
//     if (urlLower.includes('/forum/') || urlLower.includes('/discuss/')) {
//       return 'forum';
//     }

//     return 'article';
//   }

//   /**
//    * Calculate relevance score based on query terms
//    */
//   private calculateRelevanceScore(
//     title: string,
//     description: string,
//     snippet: string,
//     queryTerms: string[],
//   ): number {
//     let score = 0;
//     const titleLower = title.toLowerCase();
//     const descLower = description.toLowerCase();
//     const snippetLower = snippet.toLowerCase();

//     queryTerms.forEach((term) => {
//       // Title matches are most valuable
//       if (titleLower.includes(term)) {
//         score += 0.4;
//       }

//       // Snippet matches are second most valuable
//       if (snippetLower.includes(term)) {
//         score += 0.3;
//       }

//       // Description matches are least valuable
//       if (descLower.includes(term)) {
//         score += 0.2;
//       }

//       // Exact phrase match bonus
//       const fullQuery = queryTerms.join(' ');
//       if (titleLower.includes(fullQuery)) {
//         score += 0.3;
//       }
//       if (descLower.includes(fullQuery)) {
//         score += 0.2;
//       }
//     });

//     // Normalize score to 0-1 range
//     return Math.min(1.0, score / queryTerms.length);
//   }

//   /**
//    * Extract query terms for matching
//    */
//   private extractQueryTerms(query: string): string[] {
//     return query
//       .toLowerCase()
//       .replace(/[^\w\s]/g, ' ')
//       .split(/\s+/)
//       .filter((term) => term.length > 2);
//   }

//   /**
//    * Clean URL by removing tracking parameters
//    */
//   private cleanUrl(url: string): string {
//     try {
//       const urlObj = new URL(url);

//       // Remove common tracking parameters
//       const trackingParams = [
//         'utm_source',
//         'utm_medium',
//         'utm_campaign',
//         'utm_term',
//         'utm_content',
//         'fbclid',
//         'gclid',
//         'msclkid',
//         'mc_cid',
//         'mc_eid',
//       ];

//       trackingParams.forEach((param) => {
//         urlObj.searchParams.delete(param);
//       });

//       return urlObj.toString();
//     } catch (error) {
//       return url;
//     }
//   }

//   /**
//    * Clean and normalize text
//    */
//   private cleanText(text: string): string {
//     return text
//       .replace(/\s+/g, ' ') // Normalize whitespace
//       .replace(/\n+/g, ' ') // Remove newlines
//       .trim();
//   }

//   /**
//    * Calculate processing statistics
//    */
//   private calculateProcessingStats(results: ScrapedResult[]): {
//     totalPages: number;
//     successfulExtractions: number;
//     failedExtractions: number;
//     averageRelevanceScore: number;
//   } {
//     const totalPages = results.length;
//     const successfulExtractions = results.filter(
//       (r) => r.title && r.url && r.description,
//     ).length;
//     const failedExtractions = totalPages - successfulExtractions;

//     const averageRelevanceScore =
//       results.length > 0
//         ? results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length
//         : 0;

//     return {
//       totalPages,
//       successfulExtractions,
//       failedExtractions,
//       averageRelevanceScore: parseFloat(averageRelevanceScore.toFixed(3)),
//     };
//   }

//   /**
//    * Build enhanced context for AI service
//    */
//   buildEnhancedContext(
//     scraperResponse: ScraperResponse,
//     maxResults: number = 5,
//   ): EnhancedContext {
//     const topResults = scraperResponse.results.slice(0, maxResults);

//     // Generate context summary
//     const contextSummary = this.generateContextSummary(
//       scraperResponse.query,
//       topResults,
//     );

//     // Extract top sources
//     const topSources = topResults.map(
//       (result) => result.metadata?.domain || result.url,
//     );

//     return {
//       query: scraperResponse.query,
//       searchResults: topResults,
//       contextSummary,
//       topSources,
//       relevanceThreshold: this.relevanceThreshold,
//       timestamp: new Date().toISOString(),
//     };
//   }

//   /**
//    * Generate context summary for AI
//    */
//   private generateContextSummary(
//     query: string,
//     results: ScrapedResult[],
//   ): string {
//     if (results.length === 0) {
//       return `No relevant results found for query: "${query}"`;
//     }

//     const summaryParts = [
//       `Search results for: "${query}"`,
//       `Found ${results.length} relevant sources:`,
//     ];

//     results.forEach((result, index) => {
//       summaryParts.push(
//         `${index + 1}. ${result.title} (${result.metadata?.domain || 'source'})`,
//         `   - ${result.snippet.substring(0, 150)}...`,
//         `   - Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`,
//       );
//     });

//     return summaryParts.join('\n');
//   }

//   /**
//    * Format scraped results for AI prompt integration
//    */
//   formatForAIPrompt(enhancedContext: EnhancedContext): string {
//     const { query, searchResults, contextSummary } = enhancedContext;

//     const promptParts = [
//       '\n[Web Search Results]',
//       `Query: "${query}"`,
//       `Retrieved: ${new Date(enhancedContext.timestamp).toLocaleString()}`,
//       '',
//       contextSummary,
//       '',
//       '[Detailed Results]',
//     ];

//     searchResults.forEach((result, index) => {
//       promptParts.push(
//         `[${index + 1}] ${result.title}`,
//         `URL: ${result.url}`,
//         `Source: ${result.metadata?.domain || 'Unknown'}`,
//         `Content: ${result.description}`,
//         `Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`,
//         '',
//       );
//     });

//     promptParts.push(
//       '[Instructions for AI]',
//       '- Use these search results to provide accurate, up-to-date information',
//       '- Cite sources by referring to their numbered position [1], [2], etc.',
//       '- Prioritize results with higher relevance scores',
//       '- If information conflicts between sources, note the discrepancy',
//       '- Do not fabricate information not present in the search results',
//     );

//     return promptParts.join('\n');
//   }

//   /**
//    * Cache scraped results
//    */
//   private async cacheScrapedResults(
//     query: string,
//     response: ScraperResponse,
//   ): Promise<void> {
//     try {
//       const cacheKey = `scraper:${query.toLowerCase().trim()}`;
//       await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response));
//       this.logger.debug(`Cached scraping results for query: ${query}`);
//     } catch (error) {
//       this.logger.error(`Failed to cache scraping results: ${error.message}`);
//     }
//   }

//   /**
//    * Get cached scraped results
//    */
//   private async getCachedScrapedResults(
//     query: string,
//   ): Promise<ScraperResponse | null> {
//     try {
//       const cacheKey = `scraper:${query.toLowerCase().trim()}`;
//       const cached = await this.redis.get(cacheKey);

//       if (cached) {
//         return JSON.parse(cached);
//       }
//     } catch (error) {
//       this.logger.error(`Failed to get cached results: ${error.message}`);
//     }

//     return null;
//   }

//   /**
//    * Log scraping activity
//    */
//   private async logScrapingActivity(
//     userId: string,
//     query: string,
//     resultCount: number,
//   ): Promise<void> {
//     try {
//       const logKey = `scraper:logs:${userId}`;
//       const logEntry = JSON.stringify({
//         query,
//         resultCount,
//         timestamp: new Date().toISOString(),
//       });

//       await this.redis.lpush(logKey, logEntry);
//       await this.redis.ltrim(logKey, 0, 99); // Keep last 100 scraping activities
//       await this.redis.expire(logKey, 86400 * 30); // 30 days
//     } catch (error) {
//       this.logger.error(`Failed to log scraping activity: ${error.message}`);
//     }
//   }

//   /**
//    * Get user scraping statistics
//    */
//   async getUserScrapingStats(userId: string): Promise<any> {
//     try {
//       const logKey = `scraper:logs:${userId}`;
//       const logs = await this.redis.lrange(logKey, 0, -1);

//       const activities = logs.map((log) => JSON.parse(log));

//       return {
//         totalScrapes: activities.length,
//         recentActivities: activities.slice(0, 10),
//         averageResults:
//           activities.reduce((sum, a) => sum + a.resultCount, 0) /
//             activities.length || 0,
//       };
//     } catch (error) {
//       this.logger.error(`Failed to get user scraping stats: ${error.message}`);
//       return {
//         totalScrapes: 0,
//         recentActivities: [],
//         averageResults: 0,
//       };
//     }
//   }

//   /**
//    * Health check for scraper service
//    */
//   async healthCheck(): Promise<boolean> {
//     try {
//       const response = await firstValueFrom(
//         this.httpService.get(`${this.whoogleBaseUrl}/`, {
//           timeout: 5000,
//         }),
//       );
//       return response.status === 200;
//     } catch (error) {
//       this.logger.error(`Scraper health check failed: ${error.message}`);
//       return false;
//     }
//   }
// }
