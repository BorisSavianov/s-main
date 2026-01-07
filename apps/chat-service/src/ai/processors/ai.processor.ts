// apps/chat-service/src/ai/processors/ai.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiContext } from '../entities/ai-context.entity';
import { AIService } from '../ai.service';
import { VectorUtils } from '../../common/transformers/vector.transformer';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process('generate-embedding')
  async handleEmbeddingGeneration(job: Job<EmbeddingJob>) {
    const { text, sessionId, messageType, messageId } = job.data;

    try {
      this.logger.debug(
        `Generating embedding for ${messageType} message in session ${sessionId}`,
      );

      // Generate actual embedding using AIService (which handles Nomic Embed)
      const embedding = await this.aiService.generateEmbedding(text);

      if (embedding && VectorUtils.validateVector(embedding)) {
        // Store embedding using raw SQL to handle vector type properly
        const contextData = {
          text,
          messageType,
          messageId,
          embeddingGenerated: true,
          embeddingModel: 'nomic-embed-text',
          textLength: text.length,
        };

        const metadata = {
          embeddingModel: 'nomic-embed-text',
          textLength: text.length,
          messageType,
          vectorDimensions: embedding.length,
        };

        // Use raw SQL query to insert with vector
        const vectorString = `[${embedding.join(',')}]`;

        await this.aiContextRepository.query(
          `
          INSERT INTO ai_context (
            session_id, 
            context_data, 
            embedding, 
            context_type, 
            relevance_score, 
            metadata,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3::vector, $4, $5, $6, NOW(), NOW())
          `,
          [
            sessionId,
            JSON.stringify(contextData),
            vectorString,
            'embedding',
            0.8,
            JSON.stringify(metadata),
          ],
        );

        this.logger.debug(
          `Embedding generated and stored for session ${sessionId} (dimensions: ${embedding.length})`,
        );
      } else {
        this.logger.warn(
          `Failed to generate valid embedding for session ${sessionId}, falling back to text storage`,
        );

        // Store context without embedding for fallback text search using TypeORM
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

      // Find contexts without embeddings using raw SQL
      const contextsWithoutEmbeddings = await this.aiContextRepository.query(
        `
        SELECT id, session_id, context_data, created_at
        FROM ai_context
        WHERE session_id = $1
          AND embedding IS NULL
          AND context_type = $2
        LIMIT 50
        `,
        [sessionId, 'conversation'],
      );

      let processed = 0;
      let skipped = 0;

      for (const context of contextsWithoutEmbeddings) {
        const contextData =
          typeof context.context_data === 'string'
            ? JSON.parse(context.context_data)
            : context.context_data;

        const text = contextData?.userMessage || contextData?.text;

        if (text && typeof text === 'string' && text.trim().length > 0) {
          const embedding = await this.aiService.generateEmbedding(text);

          if (embedding && VectorUtils.validateVector(embedding)) {
            const embeddingContextData = {
              text,
              messageType: 'user',
              originalContextId: context.id,
              batchGenerated: true,
              textLength: text.length,
            };

            const metadata = {
              embeddingModel: 'nomic-embed-text',
              batchGenerated: true,
              originalContextId: context.id,
              vectorDimensions: embedding.length,
            };

            // Insert using raw SQL with vector
            const vectorString = `[${embedding.join(',')}]`;

            await this.aiContextRepository.query(
              `
              INSERT INTO ai_context (
                session_id, 
                context_data, 
                embedding, 
                context_type, 
                relevance_score, 
                metadata,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3::vector, $4, $5, $6, NOW(), NOW())
              `,
              [
                context.session_id,
                JSON.stringify(embeddingContextData),
                vectorString,
                'embedding',
                0.7,
                JSON.stringify(metadata),
              ],
            );

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

      // Store analysis results using TypeORM (no vector needed here)
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

      // Store comprehensive summary using TypeORM (no vector needed)
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

      // Emit summary generated event for broadcasting
      this.eventEmitter.emit('session.summary.generated', {
        sessionId,
        summary: summaryData,
      });

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

      // Use raw SQL for cleanup to handle any vector-related issues
      const result = await this.aiContextRepository.query(
        `
        DELETE FROM ai_context
        WHERE created_at < $1
          AND context_type != $2
        `,
        [cutoffDate, 'summary'], // Keep summaries longer
      );

      this.logger.log(`Cleaned up ${result[1]} AI contexts`);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup contexts: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find similar contexts using raw SQL vector operations
   */
  async findSimilarContexts(
    embedding: number[],
    sessionId: string,
    limit: number = 5,
    threshold: number = 0.7,
  ): Promise<Array<{ content: string; similarity: number; createdAt: Date }>> {
    try {
      if (!embedding || !VectorUtils.validateVector(embedding)) {
        return [];
      }

      const vectorString = `[${embedding.join(',')}]`;

      const similarContexts = await this.aiContextRepository.query(
        `
        SELECT 
          context_data,
          created_at,
          (embedding <-> $1::vector) as distance
        FROM ai_context
        WHERE session_id = $2
          AND context_type = $3
          AND embedding IS NOT NULL
          AND (embedding <-> $1::vector) < $4
        ORDER BY distance ASC
        LIMIT $5
        `,
        [
          vectorString,
          sessionId,
          'embedding',
          1 - threshold, // Convert similarity to distance
          limit,
        ],
      );

      return similarContexts.map((ctx) => {
        const contextData =
          typeof ctx.context_data === 'string'
            ? JSON.parse(ctx.context_data)
            : ctx.context_data;

        return {
          content: contextData?.text || '',
          similarity: 1 - ctx.distance, // Convert distance back to similarity
          createdAt: ctx.created_at,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to find similar contexts: ${error.message}`);
      return [];
    }
  }

  /**
   * Get embedding context statistics using raw SQL
   */
  async getEmbeddingContextStats(sessionId: string): Promise<{
    totalEmbeddings: number;
    averageDimensions: number;
    oldestEmbedding: Date | null;
    newestEmbedding: Date | null;
  }> {
    try {
      const stats = await this.aiContextRepository.query(
        `
        SELECT 
          COUNT(*) as total_embeddings,
          AVG(array_length(embedding::float[], 1)) as avg_dimensions,
          MIN(created_at) as oldest_embedding,
          MAX(created_at) as newest_embedding
        FROM ai_context
        WHERE session_id = $1
          AND context_type = $2
          AND embedding IS NOT NULL
        `,
        [sessionId, 'embedding'],
      );

      const result = stats[0] || {};

      return {
        totalEmbeddings: parseInt(result.total_embeddings) || 0,
        averageDimensions: parseFloat(result.avg_dimensions) || 0,
        oldestEmbedding: result.oldest_embedding || null,
        newestEmbedding: result.newest_embedding || null,
      };
    } catch (error) {
      this.logger.error(`Failed to get embedding stats: ${error.message}`);
      return {
        totalEmbeddings: 0,
        averageDimensions: 0,
        oldestEmbedding: null,
        newestEmbedding: null,
      };
    }
  }

  /**
   * Update embedding using raw SQL
   */
  async updateEmbedding(
    contextId: string,
    embedding: number[],
  ): Promise<boolean> {
    try {
      if (!embedding || !VectorUtils.validateVector(embedding)) {
        return false;
      }

      const vectorString = `[${embedding.join(',')}]`;

      const result = await this.aiContextRepository.query(
        `
        UPDATE ai_context
        SET embedding = $1::vector, updated_at = NOW()
        WHERE id = $2
        `,
        [vectorString, contextId],
      );

      return result[1] > 0; // Returns number of affected rows
    } catch (error) {
      this.logger.error(`Failed to update embedding: ${error.message}`);
      return false;
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
}
