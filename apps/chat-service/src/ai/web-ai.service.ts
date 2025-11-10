// apps/chat-service/src/ai/web-ai.service.ts - UPDATED
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AIService } from './ai.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  WebScraperService,
  EnhancedContext,
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
  citations?: Array<{ number: number; source: string; url: string }>;
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

      this.logger.debug('Generating response with search capability');

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

          // Perform web search
          const searchResults =
            await this.webScraperService.scrapeSearchResults(
              searchQuery,
              context.userId,
            );

          this.logger.debug(
            `Search results: ${searchResults.results.length} items found`,
          );

          if (searchResults.results.length > 0) {
            // Build enhanced context
            enhancedContext = this.webScraperService.buildEnhancedContext(
              searchResults,
              5, // Top 5 results
            );

            // Build search context for AI
            searchContext = this.buildSearchContext(enhancedContext);
            webSearchPerformed = true;
            sourcesUsed = enhancedContext.searchResults.length;

            this.logger.debug(
              `Web search completed: ${sourcesUsed} results for query "${searchQuery}"`,
            );
          }
        } catch (error) {
          this.logger.error(`Web search failed: ${error.message}`);
          // Continue without search results
        }
      }

      // Build enhanced prompt with search context
      const enhancedPrompt = await this.buildEnhancedPrompt(
        context,
        searchContext,
      );

      this.logger.debug('Enhanced prompt built, calling AI service');

      // Generate AI response using base service
      const baseResponse = await this.aiService.generateResponse({
        sessionId: context.sessionId,
        recentMessages: context.recentMessages,
        userMessage: enhancedPrompt,
      });

      // Extract citations if web search was performed
      const citations =
        webSearchPerformed && enhancedContext
          ? this.extractCitations(baseResponse.content, enhancedContext)
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
   * Build enhanced prompt with search context
   */
  private async buildEnhancedPrompt(
    context: EnhancedChatContext,
    searchContext: string,
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
      'You are a supportive mental health AI assistant. You provide empathetic, helpful responses while being careful not to provide medical advice. Always encourage users to seek professional help for serious concerns.',
      '',
      'Recent conversation:',
      recentHistory,
    ];

    if (semanticContext) {
      promptParts.push(semanticContext);
    }

    if (searchContext) {
      promptParts.push('', searchContext, '');
      promptParts.push(
        '[Instructions] When using information from web search results:',
        '- Cite sources using [1], [2], etc. notation',
        '- Prioritize results with higher relevance scores',
        '- Provide accurate, up-to-date information',
        '- If information conflicts between sources, note the discrepancy',
        '- Be transparent about the recency of the information',
      );
    }

    promptParts.push('', `User: ${context.userMessage}`, '', 'AI:');

    return promptParts.join('\n');
  }

  /**
   * Build search context string from enhanced context
   */
  private buildSearchContext(enhancedContext: EnhancedContext): string {
    const contextParts = [
      '\n[Web Search Results]',
      `Query: "${enhancedContext.query}"`,
      `Retrieved: ${new Date(enhancedContext.timestamp).toLocaleString()}`,
      `Found ${enhancedContext.searchResults.length} relevant sources:`,
      '',
    ];

    enhancedContext.searchResults.forEach((result, index) => {
      contextParts.push(
        `[${index + 1}] ${result.title}`,
        `   Source: ${result.metadata.domain}`,
        `   Content: ${result.description.substring(0, 300)}...`,
        `   Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`,
        '',
      );
    });

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
   * Extract citations from AI response
   */
  private extractCitations(
    aiResponse: string,
    enhancedContext: EnhancedContext,
  ): Array<{ number: number; source: string; url: string }> {
    const citations: Array<{
      number: number;
      source: string;
      url: string;
    }> = [];
    const citationPattern = /\[(\d+)\]/g;
    let match;

    while ((match = citationPattern.exec(aiResponse)) !== null) {
      const citationNum = parseInt(match[1]);
      const result = enhancedContext.searchResults[citationNum - 1];

      if (result) {
        citations.push({
          number: citationNum,
          source: result.title,
          url: result.url,
        });
      }
    }

    return citations;
  }
}
