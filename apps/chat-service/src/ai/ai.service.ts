// apps/chat-service/src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { firstValueFrom } from 'rxjs';
import { AiContext } from './entities/ai-context.entity';

interface ChatContext {
  sessionId: string;
  recentMessages: Array<{
    senderType: string;
    content: string;
    createdAt: Date;
  }>;
  userMessage: string;
}

interface AIResponse {
  content: string;
  sentiment?: number;
  confidence?: number;
}

interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}

interface OllamaResponse {
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly ollamaBaseUrl: string;
  private readonly defaultModel: string;
  private readonly maxRetries: number = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRepository(AiContext)
    private readonly aiContextRepository: Repository<AiContext>,
    @InjectQueue('ai-processing')
    private readonly aiQueue: Queue,
  ) {
    this.ollamaBaseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_DEFAULT_MODEL',
      'llama3.2:3b',
    );
  }

  /**
   * Generate AI response to user message
   */
  async generateResponse(context: ChatContext): Promise<AIResponse> {
    try {
      // Store context for future reference
      await this.storeContext(context);

      const prompt = this.buildPrompt(context);
      const ollamaResponse = await this.callOllama(prompt);

      // Extract sentiment from the response or analyze separately
      const sentiment = await this.analyzeSentiment(context.userMessage);

      // Queue background tasks for embeddings and analysis
      await this.queueBackgroundTasks(context, ollamaResponse);

      return {
        content: ollamaResponse.response.trim(),
        sentiment,
        confidence: this.calculateConfidence(ollamaResponse),
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate AI response: ${error.message}`,
        error.stack,
      );

      // Return fallback response
      return {
        content:
          "I'm having trouble processing your message right now. Could you please try again?",
        sentiment: 0,
        confidence: 0.5,
      };
    }
  }

  /**
   * Generate session summary
   */
  async generateSessionSummary(
    messages: Array<{ content: string; senderType: string }>,
  ): Promise<string> {
    try {
      const prompt = this.buildSummaryPrompt(messages);
      const response = await this.callOllama(prompt);
      return response.response.trim();
    } catch (error) {
      this.logger.error(
        `Failed to generate session summary: ${error.message}`,
        error.stack,
      );
      return 'Unable to generate session summary at this time.';
    }
  }

  /**
   * Analyze sentiment of text
   */
  async analyzeSentiment(text: string): Promise<number> {
    try {
      const prompt = `Analyze the emotional sentiment of the following text and respond with only a number between -1.0 (very negative) and 1.0 (very positive), where 0.0 is neutral:

"${text}"

Sentiment score:`;

      const response = await this.callOllama(prompt, {
        temperature: 0.1, // Lower temperature for more consistent results
        max_tokens: 10,
      });

      const scoreMatch = response.response.match(/-?\d+\.?\d*/);
      if (scoreMatch) {
        const score = parseFloat(scoreMatch[0]);
        return Math.max(-1, Math.min(1, score)); // Clamp between -1 and 1
      }

      return 0; // Neutral fallback
    } catch (error) {
      this.logger.error(`Failed to analyze sentiment: ${error.message}`);
      return 0;
    }
  }

  /**
   * Analyze overall session sentiment based on message contents
   */
  async analyzeSessionSentiment(messages: string[]): Promise<number> {
    try {
      const conversation = messages.join('\n');

      const prompt = `Analyze the overall emotional sentiment of the following conversation. Respond with only a number between -1.0 (very negative) and 1.0 (very positive), where 0.0 is neutral:

"${conversation}"

Overall sentiment score:`;

      const response = await this.callOllama(prompt, {
        temperature: 0.1,
        max_tokens: 10,
      });

      const scoreMatch = response.response.match(/-?\d+\.?\d*/);
      if (scoreMatch) {
        const score = parseFloat(scoreMatch[0]);
        return Math.max(-1, Math.min(1, score));
      }

      return 0;
    } catch (error) {
      this.logger.error(
        `Failed to analyze session sentiment: ${error.message}`,
      );
      return 0;
    }
  }

  /**
   * Generate text embeddings for semantic search
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      // This would require a model that supports embeddings
      // For now, we'll return null and rely on text-based search
      // In production, you'd use a dedicated embedding model like sentence-transformers
      this.logger.warn(
        'Embedding generation not implemented - using text search fallback',
      );
      return null;
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a message should be flagged
   */
  async shouldFlagMessage(
    content: string,
  ): Promise<{ shouldFlag: boolean; reason?: string; confidence?: number }> {
    try {
      const prompt = `Analyze the following message for potentially harmful content including:
- Expressions of self-harm or suicide
- Abusive language or harassment
- Inappropriate or explicit content
- Spam or meaningless text

Respond with either "FLAG: [reason]" or "SAFE" only:

"${content}"

Analysis:`;

      const response = await this.callOllama(prompt, {
        temperature: 0.1,
        max_tokens: 50,
      });

      const result = response.response.trim().toUpperCase();

      if (result.startsWith('FLAG:')) {
        const reason = result.substring(5).trim();
        return {
          shouldFlag: true,
          reason,
          confidence: this.calculateConfidence(response),
        };
      }

      return {
        shouldFlag: false,
        confidence: this.calculateConfidence(response),
      };
    } catch (error) {
      this.logger.error(`Failed to moderate content: ${error.message}`);
      return {
        shouldFlag: false,
        reason: 'Analysis failed',
        confidence: 0,
      };
    }
  }

  /**
   * Generate therapeutic recommendations based on conversation
   */
  async generateRecommendations(
    messages: Array<{ content: string; senderType: string }>,
  ): Promise<string[]> {
    try {
      const conversationText = messages
        .map((msg) => `${msg.senderType}: ${msg.content}`)
        .join('\n');

      const prompt = `Based on the following conversation, suggest 3-5 helpful therapeutic recommendations or coping strategies. Format each recommendation as a single sentence on a new line:

${conversationText}

Recommendations:`;

      const response = await this.callOllama(prompt, {
        temperature: 0.3,
        max_tokens: 200,
      });

      return response.response
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.match(/^\d+\./))
        .slice(0, 5);
    } catch (error) {
      this.logger.error(`Failed to generate recommendations: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract key topics from conversation
   */
  async extractKeyTopics(
    messages: Array<{ content: string; senderType: string }>,
  ): Promise<string[]> {
    try {
      const conversationText = messages
        .filter((msg) => msg.senderType === 'user')
        .map((msg) => msg.content)
        .join(' ');

      const prompt = `Extract 3-5 main topics or themes from the following conversation. List each topic as a single word or short phrase separated by commas:

"${conversationText}"

Topics:`;

      const response = await this.callOllama(prompt, {
        temperature: 0.2,
        max_tokens: 50,
      });

      return response.response
        .split(',')
        .map((topic) => topic.trim().toLowerCase())
        .filter((topic) => topic.length > 0)
        .slice(0, 5);
    } catch (error) {
      this.logger.error(`Failed to extract topics: ${error.message}`);
      return [];
    }
  }

  /**
   * Build conversation prompt for AI
   */
  private buildPrompt(context: ChatContext): string {
    const recentHistory = context.recentMessages
      .slice(-10) // Last 10 messages for context
      .map((msg) => `${msg.senderType}: ${msg.content}`)
      .join('\n');

    return `You are a supportive mental health AI assistant. You provide empathetic, helpful responses while being careful not to provide medical advice. Always encourage users to seek professional help for serious concerns.

Recent conversation:
${recentHistory}

User: ${context.userMessage}

AI:`;
  }

  /**
   * Build summary prompt
   */
  private buildSummaryPrompt(
    messages: Array<{ content: string; senderType: string }>,
  ): string {
    const conversationText = messages
      .map((msg) => `${msg.senderType}: ${msg.content}`)
      .join('\n');

    return `Summarize the key points and themes from this mental health support conversation in 2-3 sentences:

${conversationText}

Summary:`;
  }

  /**
   * Call Ollama API with retry logic
   */
  private async callOllama(
    prompt: string,
    options: Partial<OllamaRequest['options']> = {},
  ): Promise<OllamaResponse> {
    const requestData: OllamaRequest = {
      model: this.defaultModel,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 0.9,
        max_tokens: options.max_tokens ?? 256,
        ...options,
      },
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.post<OllamaResponse>(
            `${this.ollamaBaseUrl}/api/generate`,
            requestData,
            {
              timeout: 30000,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
        );

        if (response.data && response.data.response) {
          return response.data;
        }

        throw new Error('Invalid response from Ollama');
      } catch (error) {
        this.logger.warn(
          `Ollama request attempt ${attempt} failed: ${error.message}`,
        );

        if (attempt === this.maxRetries) {
          throw new Error(
            `Ollama service failed after ${this.maxRetries} attempts: ${error.message}`,
          );
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000),
        );
      }
    }

    throw new Error('Failed to get response from Ollama after all retries');
  }

  /**
   * Calculate confidence score based on response metadata
   */
  private calculateConfidence(response: OllamaResponse): number {
    // Simple heuristic based on response length and processing time
    const responseLength = response.response?.length || 0;
    const hasMetrics = response.eval_count && response.eval_duration;

    if (responseLength < 10) return 0.3;
    if (responseLength > 100 && hasMetrics) return 0.9;
    if (responseLength > 50) return 0.7;

    return 0.5;
  }

  /**
   * Store AI context for future reference
   */
  private async storeContext(context: ChatContext): Promise<void> {
    try {
      const contextData = {
        recentMessages: context.recentMessages,
        userMessage: context.userMessage,
        timestamp: new Date().toISOString(),
      };

      const aiContext = this.aiContextRepository.create({
        sessionId: context.sessionId,
        userId: null, // Would be populated if we had user info
        contextData,
        contextType: 'conversation',
        relevanceScore: 1.0,
      });

      await this.aiContextRepository.save(aiContext);
    } catch (error) {
      this.logger.error(`Failed to store AI context: ${error.message}`);
      // Don't throw - this shouldn't block the main response
    }
  }

  /**
   * Queue background processing tasks
   */
  private async queueBackgroundTasks(
    context: ChatContext,
    response: OllamaResponse,
  ): Promise<void> {
    try {
      // Queue embedding generation
      await this.aiQueue.add(
        'generate-embedding',
        {
          text: context.userMessage,
          sessionId: context.sessionId,
          messageType: 'user',
        },
        {
          delay: 1000, // Delay to not overwhelm the system
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      // Queue response analysis
      await this.aiQueue.add(
        'analyze-response',
        {
          userMessage: context.userMessage,
          aiResponse: response.response,
          sessionId: context.sessionId,
        },
        {
          delay: 2000,
          attempts: 2,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to queue background tasks: ${error.message}`);
      // Don't throw - background tasks are optional
    }
  }

  /**
   * Health check for AI service
   */
  async healthCheck(): Promise<{
    status: string;
    model: string;
    latency?: number;
  }> {
    try {
      const start = Date.now();
      await this.analyzeSentiment('Hello, how are you?');
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        model: this.defaultModel,
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        model: this.defaultModel,
      };
    }
  }
}
