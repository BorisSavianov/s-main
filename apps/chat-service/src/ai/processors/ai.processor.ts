// apps/chat-service/src/ai/processors/ai.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiContext } from '../entities/ai-context.entity';
import { AIService } from '../ai.service';
import { VectorUtils } from '../../common/transformers/vector.transformer';

interface EmbeddingJob {
  text: string;
  sessionId: string;
  messageType: 'user' | 'ai';
  messageId?: string;
}

interface AnalysisJob {
  userMessage: string;
  aiResponse: string;
  sessionId: string;
}

interface SummaryJob {
  sessionId: string;
  messages: Array<{
    content: string;
    senderType: string;
    createdAt: Date;
  }>;
}

@Processor('ai-processing')
@Injectable()
export class AIProcessor {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(
    @InjectRepository(AiContext)
    private readonly aiContextRepository: Repository<AiContext>,
    private readonly aiService: AIService,
  ) {}

  @Process('generate-embedding')
  async handleEmbeddingGeneration(job: Job<EmbeddingJob>) {
    const { text, sessionId, messageType, messageId } = job.data;

    try {
      this.logger.debug(
        `Generating embedding for ${messageType} message in session ${sessionId}`,
      );

      // Generate actual embedding using Nomic Embed
      const embedding = await this.generateEmbeddingVector(text);

      if (embedding && VectorUtils.validateVector(embedding)) {
        // Store embedding in context
        const contextData = {
          text,
          messageType,
          messageId,
          embeddingGenerated: true,
          embeddingModel: 'nomic-embed-text',
          textLength: text.length,
        };

        const aiContext = this.aiContextRepository.create({
          sessionId,
          contextData,
          embedding, // TypeORM will handle conversion with transformer
          contextType: 'embedding',
          relevanceScore: 0.8,
          metadata: {
            embeddingModel: 'nomic-embed-text',
            textLength: text.length,
            messageType,
            vectorDimensions: embedding.length,
          },
        });

        await this.aiContextRepository.save(aiContext);

        this.logger.debug(
          `Embedding generated and stored for session ${sessionId} (dimensions: ${embedding.length})`,
        );
      } else {
        this.logger.warn(
          `Failed to generate valid embedding for session ${sessionId}, falling back to text storage`,
        );

        // Store context without embedding for fallback text search
        const contextData = {
          text,
          messageType,
          messageId,
          embeddingGenerated: false,
          fallbackToTextSearch: true,
          reason: 'invalid_embedding_format',
        };

        const aiContext = this.aiContextRepository.create({
          sessionId,
          contextData,
          embedding: null,
          contextType: 'text',
          relevanceScore: 0.6,
        });

        await this.aiContextRepository.save(aiContext);
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('batch-generate-embeddings')
  async handleBatchEmbeddingGeneration(job: Job<{ sessionId: string }>) {
    const { sessionId } = job.data;

    try {
      this.logger.debug(
        `Starting batch embedding generation for session ${sessionId}`,
      );

      // Find contexts without embeddings
      const contextsWithoutEmbeddings = await this.aiContextRepository.find({
        where: {
          sessionId,
          embedding: undefined,
          contextType: 'conversation',
        },
        take: 50, // Process in batches
      });

      let processed = 0;
      let skipped = 0;

      for (const context of contextsWithoutEmbeddings) {
        const text =
          context.contextData?.userMessage || context.contextData?.text;
        if (text && typeof text === 'string' && text.trim().length > 0) {
          const embedding = await this.generateEmbeddingVector(text);
          if (embedding && VectorUtils.validateVector(embedding)) {
            // Create new embedding context
            const embeddingContext = this.aiContextRepository.create({
              sessionId: context.sessionId,
              contextData: {
                text,
                messageType: 'user',
                originalContextId: context.id,
                batchGenerated: true,
                textLength: text.length,
              },
              embedding,
              contextType: 'embedding',
              relevanceScore: 0.7,
              metadata: {
                embeddingModel: 'nomic-embed-text',
                batchGenerated: true,
                originalContextId: context.id,
                vectorDimensions: embedding.length,
              },
            });

            await this.aiContextRepository.save(embeddingContext);
            processed++;
          } else {
            skipped++;
            this.logger.warn(
              `Skipped invalid embedding for context ${context.id}`,
            );
          }
        } else {
          skipped++;
          this.logger.warn(
            `Skipped context ${context.id} - no valid text found`,
          );
        }
      }

      this.logger.debug(
        `Batch embedding generation completed for session ${sessionId}. Processed: ${processed}, Skipped: ${skipped}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to batch generate embeddings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('analyze-response')
  async handleResponseAnalysis(job: Job<AnalysisJob>) {
    const { userMessage, aiResponse, sessionId } = job.data;

    try {
      this.logger.debug(`Analyzing conversation for session ${sessionId}`);

      // Perform various analyses
      const sentiment = await this.aiService.analyzeSentiment(userMessage);
      const responseQuality = await this.analyzeResponseQuality(
        userMessage,
        aiResponse,
      );
      const conversationHealth = await this.assessConversationHealth(
        userMessage,
        aiResponse,
      );

      // Store analysis results
      const analysisData = {
        userMessage,
        aiResponse,
        sentiment,
        responseQuality,
        conversationHealth,
        analyzedAt: new Date().toISOString(),
      };

      const aiContext = this.aiContextRepository.create({
        sessionId,
        contextData: analysisData,
        contextType: 'analysis',
        relevanceScore: 0.9,
        metadata: {
          analysisType: 'response_quality',
          metrics: {
            sentiment,
            responseQuality,
            conversationHealth,
          },
        },
      });

      await this.aiContextRepository.save(aiContext);

      this.logger.debug(`Response analysis completed for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to analyze response: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('generate-summary')
  async handleSummaryGeneration(job: Job<SummaryJob>) {
    const { sessionId, messages } = job.data;

    try {
      this.logger.debug(`Generating summary for session ${sessionId}`);

      // Generate comprehensive summary
      const summary = await this.aiService.generateSessionSummary(messages);
      const keyTopics = await this.aiService.extractKeyTopics(messages);
      const recommendations =
        await this.aiService.generateRecommendations(messages);

      // Calculate overall sentiment
      const sentiments = await Promise.all(
        messages
          .filter((msg) => msg.senderType === 'user')
          .map((msg) => this.aiService.analyzeSentiment(msg.content)),
      );

      const overallSentiment =
        sentiments.reduce((sum, sentiment) => sum + sentiment, 0) /
          sentiments.length || 0;

      // Store comprehensive summary
      const summaryData = {
        summary,
        keyTopics,
        recommendations,
        overallSentiment,
        messageCount: messages.length,
        userMessageCount: messages.filter((msg) => msg.senderType === 'user')
          .length,
        duration: this.calculateSessionDuration(messages),
        generatedAt: new Date().toISOString(),
      };

      const aiContext = this.aiContextRepository.create({
        sessionId,
        contextData: summaryData,
        contextType: 'summary',
        relevanceScore: 1.0,
        metadata: {
          summaryType: 'comprehensive',
          metrics: {
            overallSentiment,
            topicCount: keyTopics.length,
            recommendationCount: recommendations.length,
          },
        },
      });

      await this.aiContextRepository.save(aiContext);

      this.logger.debug(
        `Summary generated and stored for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate summary: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('cleanup-contexts')
  async handleContextCleanup(job: Job<{ olderThanDays: number }>) {
    const { olderThanDays } = job.data;

    try {
      this.logger.debug(
        `Cleaning up AI contexts older than ${olderThanDays} days`,
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.aiContextRepository
        .createQueryBuilder()
        .delete()
        .where('created_at < :cutoffDate', { cutoffDate })
        .andWhere('context_type != :summaryType', { summaryType: 'summary' }) // Keep summaries longer
        .execute();

      this.logger.log(`Cleaned up ${result.affected} AI contexts`);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup contexts: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Generate embedding vector using Nomic Embed model with validation
   */
  private async generateEmbeddingVector(
    text: string,
  ): Promise<number[] | null> {
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        this.logger.warn('Invalid text provided for embedding generation');
        return null;
      }

      // Use the AI service to generate actual embeddings
      const embedding = await this.aiService.generateEmbedding(text);

      if (!embedding || !VectorUtils.validateVector(embedding)) {
        this.logger.warn('Generated embedding is invalid or null');
        return null;
      }

      // Normalize the embedding vector
      return VectorUtils.normalize(embedding);
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding vector: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Analyze the quality of AI response
   */
  private async analyzeResponseQuality(
    userMessage: string,
    aiResponse: string,
  ): Promise<number> {
    try {
      // Simple heuristics for response quality
      let score = 0.5; // Base score

      // Length appropriateness
      const responseLength = aiResponse.length;
      const userLength = userMessage.length;

      if (
        responseLength > userLength * 0.5 &&
        responseLength < userLength * 3
      ) {
        score += 0.1;
      }

      // Contains empathetic language
      const empathyWords = ['understand', 'feel', 'sorry', 'support', 'help'];
      const hasEmpathy = empathyWords.some((word) =>
        aiResponse.toLowerCase().includes(word),
      );
      if (hasEmpathy) score += 0.15;

      // Avoids medical advice
      const medicalTerms = ['diagnose', 'medication', 'prescribe', 'treatment'];
      const avoidsMedical = !medicalTerms.some((term) =>
        aiResponse.toLowerCase().includes(term),
      );
      if (avoidsMedical) score += 0.1;

      // Contains questions (engagement)
      if (aiResponse.includes('?')) score += 0.1;

      return Math.min(1.0, score);
    } catch (error) {
      this.logger.error(`Failed to analyze response quality: ${error.message}`);
      return 0.5;
    }
  }

  /**
   * Assess overall conversation health
   */
  private async assessConversationHealth(
    userMessage: string,
    aiResponse: string,
  ): Promise<number> {
    try {
      let healthScore = 0.5; // Base score

      // User engagement indicators
      if (userMessage.length > 20) healthScore += 0.1; // Detailed messages
      if (userMessage.includes('?')) healthScore += 0.05; // User asking questions

      // AI response indicators
      if (aiResponse.includes('professional help')) healthScore += 0.1; // Appropriate referrals
      if (aiResponse.length > 50) healthScore += 0.05; // Adequate response length

      // Negative indicators
      const crisisWords = ['suicide', 'kill', 'die', 'hurt myself'];
      if (
        crisisWords.some((word) => userMessage.toLowerCase().includes(word))
      ) {
        healthScore -= 0.2; // Crisis situation
      }

      return Math.max(0.0, Math.min(1.0, healthScore));
    } catch (error) {
      this.logger.error(
        `Failed to assess conversation health: ${error.message}`,
      );
      return 0.5;
    }
  }

  /**
   * Calculate session duration from messages
   */
  private calculateSessionDuration(
    messages: Array<{ createdAt: Date }>,
  ): number {
    if (messages.length < 2) return 0;

    const sortedMessages = messages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const start = new Date(sortedMessages[0].createdAt);
    const end = new Date(sortedMessages[sortedMessages.length - 1].createdAt);

    return Math.floor((end.getTime() - start.getTime()) / 1000 / 60); // Duration in minutes
  }

  /**
   * Simple hash function for pseudo-embeddings
   */
  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
