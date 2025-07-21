// apps/chat-service/src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
  ) {
    this.ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.defaultModel = this.configService.get<string>('OLLAMA_DEFAULT_MODEL', 'llama3.2:3b');
  }

  /**
   * Generate AI response to user message
   */
  async generateResponse(context: ChatContext): Promise<AIResponse> {
    try {
      const prompt = this.buildPrompt(context);
      const ollamaResponse = await this.callOllama(prompt);
      
      // Extract sentiment from the response or analyze separately
      const sentiment = await this.analyzeSentiment(context.userMessage);
      
      return {
        content: ollamaResponse.response.trim(),
        sentiment,
        confidence: this.calculateConfidence(ollamaResponse),
      };
    } catch (error) {
      this.logger.error(`Failed to generate AI response: ${error.message}`, error.stack);
      
      // Return fallback response
      return {
        content: "I'm having trouble processing your message right now. Could you please try again?",
        sentiment: 0,
        confidence: 0.5,
      };
    }
  }

  /**
   * Generate session summary
   */
  async generateSessionSummary(messages: Array<{ content: string; senderType: string }>): Promise<string> {
    try {
      const prompt = this.buildSummaryPrompt(messages);
      const response = await this.callOllama(prompt);
      return response.response.trim();
    } catch (error) {
      this.logger.error(`Failed to generate session summary: ${error.message}`, error.stack);
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
   * Generate text embeddings for semantic search
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      // This would require a model that supports embeddings
      // For now, we'll return null and rely on text-based search
      // In production, you'd use a dedicated embedding model
      this.logger.warn('Embedding generation not implemented - using text search fallback');
      return null;
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a message should be flagged
   */
  async shouldFlagMessage(content: string): Promise<{ shouldFlag: boolean; reason?: string }> {
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
        return {