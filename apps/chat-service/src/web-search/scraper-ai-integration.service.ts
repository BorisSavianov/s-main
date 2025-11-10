// // apps/chat-service/src/web-search/scraper-ai-integration.service.ts
// import { Injectable, Logger } from '@nestjs/common';
// import {
//   WebScraperService,
//   ScraperResponse,
//   EnhancedContext,
// } from './web-scraper.service';
// import { EnhancedAIService } from '../ai/web-ai.service';

// interface IntegratedSearchRequest {
//   userMessage: string;
//   sessionId: string;
//   userId: string;
//   performWebSearch: boolean;
//   maxSearchResults?: number;
// }

// interface IntegratedSearchResponse {
//   aiResponse: string;
//   webSearchPerformed: boolean;
//   searchQuery?: string;
//   sourcesUsed: number;
//   searchResults?: EnhancedContext;
//   processingTime: number;
// }

// @Injectable()
// export class ScraperAIIntegrationService {
//   private readonly logger = new Logger(ScraperAIIntegrationService.name);

//   constructor(
//     private readonly webScraperService: WebScraperService,
//     private readonly enhancedAIService: EnhancedAIService,
//   ) {}

//   /**
//    * Main integration method - combines web scraping with AI response
//    */
//   async processWithWebSearch(
//     request: IntegratedSearchRequest,
//   ): Promise<IntegratedSearchResponse> {
//     const startTime = Date.now();

//     try {
//       let enhancedContext: EnhancedContext | undefined;
//       let searchQuery: string | undefined;
//       let webSearchPerformed = false;

//       // Determine if web search should be performed
//       if (
//         request.performWebSearch &&
//         this.shouldPerformWebSearch(request.userMessage)
//       ) {
//         this.logger.debug(
//           `Web search triggered for user ${request.userId}: ${request.userMessage}`,
//         );

//         // Extract search query from user message
//         searchQuery = this.extractSearchQuery(request.userMessage);

//         // Perform web scraping
//         const scraperResponse =
//           await this.webScraperService.scrapeSearchResults(
//             searchQuery,
//             request.userId,
//           );

//         // Build enhanced context for AI
//         enhancedContext = this.webScraperService.buildEnhancedContext(
//           scraperResponse,
//           request.maxSearchResults || 5,
//         );

//         webSearchPerformed = true;

//         this.logger.debug(
//           `Web search completed: ${enhancedContext.searchResults.length} results for query "${searchQuery}"`,
//         );
//       }

//       // Build AI prompt with web search context
//       const aiPrompt = this.buildIntegratedPrompt(
//         request.userMessage,
//         enhancedContext,
//       );

//       // Generate AI response (implementation depends on your EnhancedAIService)
//       // This is a simplified example - adjust based on your actual AI service interface
//       const aiResponse = await this.generateAIResponseWithContext(
//         request.sessionId,
//         aiPrompt,
//         enhancedContext,
//       );

//       return {
//         aiResponse,
//         webSearchPerformed,
//         searchQuery,
//         sourcesUsed: enhancedContext?.searchResults.length || 0,
//         searchResults: enhancedContext,
//         processingTime: Date.now() - startTime,
//       };
//     } catch (error) {
//       this.logger.error(
//         `Integrated search processing failed: ${error.message}`,
//       );
//       throw error;
//     }
//   }

//   /**
//    * Determine if web search should be performed based on user message
//    */
//   private shouldPerformWebSearch(message: string): boolean {
//     const searchTriggers = [
//       /what('s| is| are) the (latest|current|recent)/i,
//       /today('s)?|this (week|month|year)/i,
//       /news about/i,
//       /happening (now|currently)/i,
//       /search for/i,
//       /look up/i,
//       /find information/i,
//       /tell me about.*\d{4}/i, // Questions about specific years
//       /weather (in|at|for)/i,
//       /price of/i,
//       /stock (price|market)/i,
//       /when (did|was|is)/i,
//       /where (is|can|does)/i,
//       /how (many|much|long)/i,
//       /statistics (about|on|for)/i,
//       /research (on|about)/i,
//       /latest (version|update|release)/i,
//     ];

//     return searchTriggers.some((pattern) => pattern.test(message));
//   }

//   /**
//    * Extract search query from user message
//    */
//   private extractSearchQuery(message: string): string {
//     // Remove common prefixes
//     let query = message
//       .replace(
//         /^(search for|look up|find|tell me about|what('s| is| are))\s+/i,
//         '',
//       )
//       .trim();

//     // Limit query length
//     if (query.length > 200) {
//       query = query.substring(0, 200);
//     }

//     return query;
//   }

//   /**
//    * Build integrated prompt combining user message and web search context
//    */
//   private buildIntegratedPrompt(
//     userMessage: string,
//     enhancedContext?: EnhancedContext,
//   ): string {
//     const promptParts = [
//       'You are a supportive mental health AI assistant with access to current web information.',
//       'Provide empathetic, helpful responses while being careful not to provide medical advice.',
//       'Always encourage users to seek professional help for serious concerns.',
//       '',
//       `User Message: ${userMessage}`,
//     ];

//     // Add web search context if available
//     if (enhancedContext && enhancedContext.searchResults.length > 0) {
//       const webContext =
//         this.webScraperService.formatForAIPrompt(enhancedContext);
//       promptParts.push('', webContext);
//     }

//     return promptParts.join('\n');
//   }

//   /**
//    * Generate AI response with web search context
//    * This is a simplified implementation - adjust based on your actual EnhancedAIService
//    */
//   private async generateAIResponseWithContext(
//     sessionId: string,
//     prompt: string,
//     enhancedContext?: EnhancedContext,
//   ): Promise<string> {
//     // This should call your actual AI service
//     // The implementation depends on how your EnhancedAIService is structured

//     // Example placeholder - replace with actual implementation:
//     return `AI response based on prompt with ${enhancedContext ? enhancedContext.searchResults.length : 0} web sources`;
//   }

//   /**
//    * Extract citations from AI response and match with sources
//    */
//   extractCitations(
//     aiResponse: string,
//     searchResults?: EnhancedContext,
//   ): Array<{ number: number; source: string; url: string }> {
//     if (!searchResults) return [];

//     const citations: Array<{
//       number: number;
//       source: string;
//       url: string;
//     }> = [];
//     const citationPattern = /\[(\d+)\]/g;
//     let match;

//     while ((match = citationPattern.exec(aiResponse)) !== null) {
//       const citationNum = parseInt(match[1]);
//       const result = searchResults.searchResults[citationNum - 1];

//       if (result) {
//         citations.push({
//           number: citationNum,
//           source: result.title,
//           url: result.url,
//         });
//       }
//     }

//     return citations;
//   }

//   /**
//    * Validate and sanitize web search results for AI consumption
//    */
//   validateSearchResults(scraperResponse: ScraperResponse): {
//     valid: boolean;
//     warnings: string[];
//     sanitizedResults: ScraperResponse;
//   } {
//     const warnings: string[] = [];

//     // Check for minimum result quality
//     if (scraperResponse.processingStats.averageRelevanceScore < 0.5) {
//       warnings.push(
//         'Low average relevance score - results may not be highly relevant',
//       );
//     }

//     // Check for failed extractions
//     if (scraperResponse.processingStats.failedExtractions > 0) {
//       warnings.push(
//         `${scraperResponse.processingStats.failedExtractions} results failed extraction`,
//       );
//     }

//     // Filter out low-quality results
//     const sanitizedResults = {
//       ...scraperResponse,
//       results: scraperResponse.results.filter(
//         (result) =>
//           result.relevanceScore >= 0.6 && result.description.length > 50,
//       ),
//     };

//     return {
//       valid: sanitizedResults.results.length > 0,
//       warnings,
//       sanitizedResults,
//     };
//   }

//   /**
//    * Generate structured response for mental health queries with web data
//    */
//   async processHealthQuery(
//     query: string,
//     userId: string,
//   ): Promise<{
//     response: string;
//     sources: Array<{ title: string; url: string; reliability: string }>;
//     disclaimer: string;
//   }> {
//     try {
//       // Perform web scraping
//       const scraperResponse = await this.webScraperService.scrapeSearchResults(
//         query,
//         userId,
//       );

//       // Validate and filter results
//       const validation = this.validateSearchResults(scraperResponse);

//       if (!validation.valid) {
//         return {
//           response:
//             'I found limited reliable information on this topic. Please consult with a healthcare professional for accurate guidance.',
//           sources: [],
//           disclaimer:
//             'Mental health information should always be verified with qualified professionals.',
//         };
//       }

//       // Extract reliable health sources
//       const reliableSources = this.filterHealthSources(
//         validation.sanitizedResults.results,
//       );

//       // Build response
//       const enhancedContext = this.webScraperService.buildEnhancedContext(
//         validation.sanitizedResults,
//         5,
//       );

//       return {
//         response: `Based on current information: ${enhancedContext.contextSummary}`,
//         sources: reliableSources.map((result) => ({
//           title: result.title,
//           url: result.url,
//           reliability: this.assessSourceReliability(
//             result.metadata?.domain || '',
//           ),
//         })),
//         disclaimer:
//           'This information is for educational purposes only and should not replace professional medical advice.',
//       };
//     } catch (error) {
//       this.logger.error(`Health query processing failed: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Filter health-related sources for reliability
//    */
//   private filterHealthSources(results: any[]): any[] {
//     const reliableDomains = [
//       'nih.gov',
//       'cdc.gov',
//       'who.int',
//       'mayoclinic.org',
//       'webmd.com',
//       'healthline.com',
//       'medlineplus.gov',
//       'nimh.nih.gov',
//       'samhsa.gov',
//       'nami.org',
//     ];

//     return results.filter((result) => {
//       const domain = result.metadata?.domain || '';
//       return (
//         reliableDomains.some((reliable) => domain.includes(reliable)) ||
//         result.relevanceScore > 0.8
//       );
//     });
//   }

//   /**
//    * Assess source reliability
//    */
//   private assessSourceReliability(domain: string): string {
//     const highReliability = ['nih.gov', 'cdc.gov', 'who.int', 'gov', 'edu'];
//     const mediumReliability = [
//       'mayoclinic.org',
//       'webmd.com',
//       'healthline.com',
//       'org',
//     ];

//     if (highReliability.some((d) => domain.includes(d))) {
//       return 'high';
//     }
//     if (mediumReliability.some((d) => domain.includes(d))) {
//       return 'medium';
//     }
//     return 'low';
//   }
// }
