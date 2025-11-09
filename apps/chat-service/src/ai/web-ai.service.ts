// apps/chat-service/src/ai/web-ai.service.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AIService } from './ai.service';
import { WebSearchService } from '../web-search/web-search.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

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
}

@Injectable()
export class EnhancedAIService {
  private readonly logger = new Logger(EnhancedAIService.name);

  constructor(
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
    @Inject(forwardRef(() => WebSearchService))
    private readonly webSearchService: WebSearchService,
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
      let searchContext = '';
      let webSearchPerformed = false;
      let searchQuery = '';
      let sourcesUsed = 0;

      this.logger.debug('response with search');

      this.logger.warn(context.webSearchEnabled + ' ' + context.userId);

      // Check if web search should be performed
      if (
        context.webSearchEnabled &&
        context.userId
        // this.webSearchService.shouldPerformSearch(context.userMessage)
      ) {
        this.logger.debug(
          `Web search triggered for user ${context.userId}: ${context.userMessage}`,
        );

        try {
          // Extract search query from message
          searchQuery = this.webSearchService.extractSearchQuery(
            context.userMessage,
          );

          // Perform web search
          const searchResults = await this.webSearchService.search(
            searchQuery,
            context.userId,
          );

          this.logger.log(searchResults);

          if (searchResults.results.length > 0) {
            // Build search context for AI
            searchContext =
              this.webSearchService.buildSearchContext(searchResults);
            webSearchPerformed = true;
            sourcesUsed = searchResults.results.length;

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

      this.logger.log(enhancedPrompt);

      // Generate AI response using base service
      const baseResponse = await this.aiService.generateResponse({
        sessionId: context.sessionId,
        recentMessages: context.recentMessages,
        userMessage: enhancedPrompt,
      });

      // Queue content moderation
      await this.chatQueue.add(
        'moderate-content',
        {
          messageId: messageId,
          content: context.userMessage,
          sessionId: context.sessionId,
        },
        {
          priority: 1, // High priority for safety
          attempts: 2,
        },
      );

      return {
        ...baseResponse,
        webSearchPerformed,
        searchQuery: webSearchPerformed ? searchQuery : undefined,
        sourcesUsed: webSearchPerformed ? sourcesUsed : undefined,
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
      promptParts.push(searchContext);
      promptParts.push(
        '[Note] When using information from web search results, mention the source and provide accurate, up-to-date information.',
      );
    }

    promptParts.push('', `User: ${context.userMessage}`, '', 'AI:');

    return promptParts.join('\n');
  }
}
