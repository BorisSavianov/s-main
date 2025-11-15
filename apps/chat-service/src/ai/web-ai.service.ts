// apps/chat-service/src/ai/web-ai.service.ts - ENHANCED VERSION
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AIService } from './ai.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  WebScraperService,
  EnhancedContext,
  NormalizedSearchResult,
} from '../web-search/web-scraper.service';

interface EnhancedChatContext {
  sessionId: string;
  recentMessages: Array<{
    senderType: string;
    content: string;
    createdAt: Date;
  }>;
  userMessage: string;
  webSearchEnabled?: boolean;
  userId?: string;
}

interface EnhancedAIResponse {
  content: string;
  sentiment?: number;
  confidence?: number;
  webSearchPerformed?: boolean;
  searchQuery?: string;
  sourcesUsed?: number;
  citations?: Array<{
    number: number;
    source: string;
    url: string;
    excerpt?: string;
  }>;
  fullContextAvailable?: boolean;
  extractedContent?: boolean;
}

@Injectable()
export class EnhancedAIService {
  private readonly logger = new Logger(EnhancedAIService.name);

  constructor(
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
    @Inject(forwardRef(() => WebScraperService))
    private readonly webScraperService: WebScraperService,
    @InjectQueue('chat-processing')
    private chatQueue: Queue,
  ) {}

  /**
   * Generate AI response with optional web search integration
   * Now uses enhanced scraper with HTML content extraction
   */
  async generateResponseWithSearch(
    context: EnhancedChatContext,
    messageId: string,
  ): Promise<EnhancedAIResponse> {
    try {
      let enhancedContext: EnhancedContext | undefined;
      let searchContext = '';
      let webSearchPerformed = false;
      let searchQuery = '';
      let sourcesUsed = 0;
      let fullContextAvailable = false;
      let extractedContent = false;

      this.logger.debug('Generating response with enhanced search capability');

      // Check if web search should be performed
      if (
        context.webSearchEnabled &&
        context.userId &&
        this.shouldPerformSearch(context.userMessage)
      ) {
        this.logger.debug(
          `Web search triggered for user ${context.userId}: ${context.userMessage}`,
        );

        try {
          // Extract search query from message
          searchQuery = this.extractSearchQuery(context.userMessage);

          // Perform enhanced web search with HTML fetching
          const searchResults =
            await this.webScraperService.scrapeSearchResults(
              searchQuery,
              context.userId,
            );

          this.logger.debug(
            `Enhanced search completed: ${searchResults.results.length} results found`,
          );
          this.logger.debug(
            `HTML fetch stats: ${searchResults.processingStats.htmlFetchSuccess} successful, ` +
              `${searchResults.processingStats.htmlFetchFailed} failed`,
          );

          if (searchResults.results.length > 0) {
            // Build enhanced context with full content
            enhancedContext = this.webScraperService.buildEnhancedContext(
              searchResults,
              5, // Top 5 results
            );

            // Build comprehensive search context for AI
            searchContext = this.buildEnhancedSearchContext(enhancedContext);
            webSearchPerformed = true;
            sourcesUsed = enhancedContext.searchResults.length;
            fullContextAvailable = enhancedContext.fullTextContent
              ? enhancedContext.fullTextContent.length > 0
              : false;
            extractedContent = enhancedContext.searchResults.some(
              (r) => r.extractedContent !== undefined,
            );

            this.logger.debug(
              `Enhanced context built: ${sourcesUsed} sources, ` +
                `full content available: ${fullContextAvailable}, ` +
                `extracted content: ${extractedContent}`,
            );
          }
        } catch (error) {
          this.logger.error(`Enhanced web search failed: ${error.message}`);
          // Continue without search results
        }
      }

      // Build enhanced prompt with rich search context
      const enhancedPrompt = await this.buildEnhancedPrompt(
        context,
        searchContext,
        enhancedContext,
      );

      this.logger.debug('Enhanced prompt built, calling AI service');

      // Generate AI response using base service
      const baseResponse = await this.aiService.generateResponse({
        sessionId: context.sessionId,
        recentMessages: context.recentMessages,
        userMessage: enhancedPrompt,
      });

      // Extract and enhance citations if web search was performed
      const citations =
        webSearchPerformed && enhancedContext
          ? this.extractEnhancedCitations(baseResponse.content, enhancedContext)
          : undefined;

      // Queue content moderation
      await this.chatQueue.add(
        'moderate-content',
        {
          messageId: messageId,
          content: context.userMessage,
          sessionId: context.sessionId,
        },
        {
          priority: 1,
          attempts: 2,
        },
      );

      return {
        ...baseResponse,
        webSearchPerformed,
        searchQuery: webSearchPerformed ? searchQuery : undefined,
        sourcesUsed: webSearchPerformed ? sourcesUsed : undefined,
        citations,
        fullContextAvailable,
        extractedContent,
      };
    } catch (error) {
      this.logger.error(
        `Enhanced AI response generation failed: ${error.message}`,
      );

      // Fallback to base service
      const fallbackResponse = await this.aiService.generateResponse({
        sessionId: context.sessionId,
        recentMessages: context.recentMessages,
        userMessage: context.userMessage,
      });

      return {
        ...fallbackResponse,
        webSearchPerformed: false,
      };
    }
  }

  /**
   * Build enhanced prompt with rich search context and extracted content
   */
  private async buildEnhancedPrompt(
    context: EnhancedChatContext,
    searchContext: string,
    enhancedContext?: EnhancedContext,
  ): Promise<string> {
    const recentHistory = context.recentMessages
      .slice(-10)
      .map((msg) => `${msg.senderType}: ${msg.content}`)
      .join('\n');

    // Get semantic context from existing service
    const semanticContext = await this.aiService.getRelevantContext(
      context.userMessage,
      context.sessionId,
    );

    const promptParts = [
      'You are a supportive mental health AI assistant with access to current web information.',
      'You provide empathetic, helpful responses while being careful not to provide medical advice.',
      'Always encourage users to seek professional help for serious concerns.',
      '',
      'Recent conversation:',
      recentHistory,
    ];

    if (semanticContext) {
      promptParts.push(semanticContext);
    }

    if (searchContext && enhancedContext) {
      promptParts.push('', searchContext, '');

      // Add enhanced instructions based on content availability
      if (
        enhancedContext.fullTextContent &&
        enhancedContext.fullTextContent.length > 0
      ) {
        promptParts.push(
          '[Enhanced Instructions] You have access to full extracted content from web pages:',
          '- Use the detailed extracted content to provide comprehensive, accurate answers',
          '- Reference specific facts and details from the full content',
          '- Cite sources using [1], [2], etc. notation',
          '- Prioritize information from sources with higher relevance scores',
          '- Cross-reference information across multiple sources when available',
          '- Note the meta titles and descriptions for context',
          '- Use headings from sources to understand content structure',
          '- If information conflicts between sources, acknowledge the discrepancy',
          '- Be transparent about the recency and quality of the information',
          "- Do not fabricate or extrapolate beyond what's in the extracted content",
        );
      } else {
        promptParts.push(
          '[Standard Instructions] When using information from web search results:',
          '- Cite sources using [1], [2], etc. notation',
          '- Prioritize results with higher relevance scores',
          '- Provide accurate, up-to-date information based on descriptions',
          '- If information conflicts between sources, note the discrepancy',
          '- Be transparent about the recency of the information',
        );
      }
    }

    promptParts.push('', `User: ${context.userMessage}`, '', 'AI:');

    return promptParts.join('\n');
  }

  /**
   * Build enhanced search context with full extracted content
   */
  private buildEnhancedSearchContext(enhancedContext: EnhancedContext): string {
    const contextParts = [
      '\n[Enhanced Web Search Results with Full Content]',
      `Query: "${enhancedContext.query}"`,
      `Retrieved: ${new Date(enhancedContext.timestamp).toLocaleString()}`,
      `Found ${enhancedContext.searchResults.length} relevant sources with extracted content:`,
      '',
    ];

    enhancedContext.searchResults.forEach((result, index) => {
      contextParts.push(
        `[${index + 1}] ${result.title}`,
        `   Source: ${result.metadata.domain}`,
        `   URL: ${result.url}`,
        `   Relevance: ${((result.relevanceScore || 0) * 100).toFixed(0)}%`,
      );

      // Add meta information if available
      if (result.extractedContent) {
        if (result.extractedContent.metaTitle) {
          contextParts.push(
            `   Meta Title: ${result.extractedContent.metaTitle}`,
          );
        }

        if (result.extractedContent.metaDescription) {
          contextParts.push(
            `   Meta Description: ${result.extractedContent.metaDescription}`,
          );
        }

        // Add key headings for structure understanding
        if (result.extractedContent.headings.length > 0) {
          contextParts.push(
            `   Key Sections: ${result.extractedContent.headings.slice(0, 5).join(' | ')}`,
          );
        }

        // Add full extracted content
        if (result.extractedContent.mainText) {
          contextParts.push(
            `   Full Extracted Content:`,
            `   ${result.extractedContent.mainText.substring(0, 2000)}${result.extractedContent.mainText.length > 2000 ? '...' : ''}`,
          );
        }

        // Add key paragraphs if main text not available
        if (
          !result.extractedContent.mainText &&
          result.extractedContent.paragraphs.length > 0
        ) {
          contextParts.push(
            `   Key Paragraphs:`,
            ...result.extractedContent.paragraphs
              .slice(0, 3)
              .map((p) => `   - ${p}`),
          );
        }
      } else {
        // Fallback to description if extraction failed
        contextParts.push(
          `   Description: ${result.description.substring(0, 300)}...`,
        );
      }

      contextParts.push('');
    });

    // Add full text content summary
    if (
      enhancedContext.fullTextContent &&
      enhancedContext.fullTextContent.length > 0
    ) {
      contextParts.push(
        '[Full Content Summary]',
        `Successfully extracted full content from ${enhancedContext.fullTextContent.length} sources.`,
        'Use this detailed information to provide comprehensive, well-sourced answers.',
        '',
      );
    }

    return contextParts.join('\n');
  }

  /**
   * Determine if web search should be performed
   */
  private shouldPerformSearch(message: string): boolean {
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
      /current (status|situation|state)/i,
      /recent (developments|changes|updates)/i,
    ];

    return searchTriggers.some((pattern) => pattern.test(message));
  }

  /**
   * Extract search query from user message
   */
  extractSearchQuery(message: string): string {
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
   * Extract enhanced citations with excerpts from AI response
   */
  private extractEnhancedCitations(
    aiResponse: string,
    enhancedContext: EnhancedContext,
  ): Array<{ number: number; source: string; url: string; excerpt?: string }> {
    const citations: Array<{
      number: number;
      source: string;
      url: string;
      excerpt?: string;
    }> = [];
    const citationPattern = /\[(\d+)\]/g;
    let match;

    while ((match = citationPattern.exec(aiResponse)) !== null) {
      const citationNum = parseInt(match[1]);
      const result = enhancedContext.searchResults[citationNum - 1];

      if (result) {
        // Find relevant excerpt from extracted content
        let excerpt: string | undefined;

        if (result.extractedContent?.mainText) {
          // Try to find the most relevant excerpt based on context around citation
          const citationIndex = match.index;
          const contextBefore = aiResponse.substring(
            Math.max(0, citationIndex - 200),
            citationIndex,
          );

          // Simple heuristic: find first sentence in extracted content that contains
          // words from the context
          const contextWords = contextBefore
            .toLowerCase()
            .split(/\s+/)
            .slice(-10);
          const sentences = result.extractedContent.mainText.split(/[.!?]\s+/);

          for (const sentence of sentences) {
            const sentenceLower = sentence.toLowerCase();
            const matches = contextWords.filter(
              (word) => word.length > 4 && sentenceLower.includes(word),
            ).length;

            if (matches >= 2) {
              excerpt = sentence.substring(0, 200);
              break;
            }
          }

          // Fallback to first paragraph
          if (!excerpt && result.extractedContent.paragraphs.length > 0) {
            excerpt = result.extractedContent.paragraphs[0].substring(0, 200);
          }
        }

        citations.push({
          number: citationNum,
          source: result.title,
          url: result.url,
          excerpt: excerpt || result.description.substring(0, 200),
        });
      }
    }

    return citations;
  }

  /**
   * Validate and enrich search results for safe AI consumption
   */
  async validateAndEnrichResults(results: NormalizedSearchResult[]): Promise<{
    valid: boolean;
    warnings: string[];
    enrichedResults: NormalizedSearchResult[];
  }> {
    const warnings: string[] = [];

    // Check average relevance
    const avgRelevance =
      results.reduce((sum, r) => sum + (r.relevanceScore || 0), 0) /
      results.length;

    if (avgRelevance < 0.5) {
      warnings.push(
        'Low average relevance score - results may not be highly relevant',
      );
    }

    // Check HTML fetch success rate
    const htmlFetchSuccess = results.filter(
      (r) => r.html && r.metadata.statusCode === 200,
    ).length;

    if (htmlFetchSuccess < results.length * 0.5) {
      warnings.push(
        `Only ${htmlFetchSuccess}/${results.length} pages successfully fetched - some content may be missing`,
      );
    }

    // Filter and enrich
    const enrichedResults = results.filter(
      (result) =>
        (result.relevanceScore || 0) >= 0.6 &&
        (result.description.length > 50 || result.extractedContent?.mainText),
    );

    return {
      valid: enrichedResults.length > 0,
      warnings,
      enrichedResults,
    };
  }
}
