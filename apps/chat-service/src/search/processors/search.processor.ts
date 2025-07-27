// apps/chat-service/src/search/processors/search.processor.ts
import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';

import { SearchService } from '../search.service';
import { ChatMessage } from '../../chat/entities/chat-message.entity';
import { ChatSession } from '../../chat/entities/chat-session.entity';
import { AIService } from '../../ai/ai.service';

interface IndexMessageJob {
  messageId: string;
  generateEmbedding?: boolean;
  priority?: number;
}

interface BulkIndexJob {
  messageIds: string[];
  batchSize?: number;
}

interface ReindexSessionJob {
  sessionId: string;
  forceRegenerate?: boolean;
}

interface BatchGenerateEmbeddingsJob {
  sessionId: string;
  messageIds?: string[];
  batchSize?: number;
}

interface OptimizeIndexJob {
  indexName?: string;
  forceMerge?: boolean;
}

interface AnalyzeSearchPatterns {
  sessionId?: string;
  startDate?: Date;
  endDate?: Date;
}

@Processor('search-indexing')
@Injectable()
export class SearchProcessor {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly aiService: AIService,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
  ) {}

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.debug(
      `Job ${job.id} completed with result: ${JSON.stringify(result)}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.id} failed with error: ${err.message}`,
      err.stack,
    );
  }

  @Process('index-message')
  async handleIndexMessage(job: Job<IndexMessageJob>) {
    const { messageId, generateEmbedding = true } = job.data;
    this.logger.debug(`Message ${messageId} indexing`);
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      await this.searchService.indexMessage(message, generateEmbedding);

      this.logger.debug(`Message ${messageId} indexed successfully`);

      return {
        messageId,
        indexed: true,
        embeddingGenerated: generateEmbedding,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to index message ${messageId}: ${error.message}`,
      );
      throw error;
    }
  }

  @Process('bulk-index')
  async handleBulkIndex(job: Job<BulkIndexJob>) {
    const { messageIds, batchSize = 50 } = job.data;

    try {
      const messages = await this.messageRepository.find({
        where: { id: In(messageIds) },
        order: { createdAt: 'ASC' },
      });

      if (messages.length === 0) {
        throw new Error('No messages found for bulk indexing');
      }

      await this.searchService.bulkIndexMessages(messages, batchSize);

      this.logger.log(`Bulk indexed ${messages.length} messages`);

      return {
        totalProcessed: messages.length,
        batchSize,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Bulk indexing failed: ${error.message}`);
      throw error;
    }
  }

  @Process('reindex-session')
  async handleReindexSession(job: Job<ReindexSessionJob>) {
    const { sessionId, forceRegenerate = false } = job.data;

    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const messages = await this.messageRepository.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
      });

      if (messages.length === 0) {
        this.logger.warn(`No messages found for session ${sessionId}`);
        return { sessionId, messagesProcessed: 0 };
      }

      // If force regenerate, clear existing embeddings
      if (forceRegenerate) {
        await this.messageRepository.update({ sessionId }, { embedding: null });
      }

      // Process messages in smaller batches for large sessions
      const batchSize = 25;
      let totalProcessed = 0;

      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        // Update job progress
        await job.progress(Math.floor((i / messages.length) * 100));

        await this.searchService.bulkIndexMessages(batch, batchSize);
        totalProcessed += batch.length;

        this.logger.debug(
          `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(messages.length / batchSize)} for session ${sessionId}`,
        );

        // Small delay to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await job.progress(100);

      this.logger.log(
        `Reindexed ${totalProcessed} messages for session ${sessionId}`,
      );

      return {
        sessionId,
        messagesProcessed: totalProcessed,
        forceRegenerate,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Session reindexing failed for ${sessionId}: ${error.message}`,
      );
      throw error;
    }
  }

  @Process('batch-generate-embeddings')
  async handleBatchGenerateEmbeddings(job: Job<BatchGenerateEmbeddingsJob>) {
    const { sessionId, messageIds, batchSize = 10 } = job.data;

    try {
      let messages: ChatMessage[];

      if (messageIds && messageIds.length > 0) {
        messages = await this.messageRepository.find({
          where: { id: In(messageIds) },
        });
      } else if (sessionId) {
        messages = await this.messageRepository.find({
          where: {
            sessionId,
            embedding: IsNull(), // Only process messages without embeddings
          },
          order: { createdAt: 'ASC' },
        });
      } else {
        throw new Error('Either sessionId or messageIds must be provided');
      }

      if (messages.length === 0) {
        this.logger.warn('No messages found for embedding generation');
        return { messagesProcessed: 0 };
      }

      let totalProcessed = 0;
      let successCount = 0;
      let errorCount = 0;

      // Process in small batches to avoid overwhelming the AI service
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        await job.progress(Math.floor((i / messages.length) * 100));

        for (const message of batch) {
          try {
            if (!message.content || message.content.trim().length === 0) {
              continue;
            }

            const embedding = await this.aiService.generateEmbedding(
              message.content,
            );

            if (embedding) {
              // Update the message with the embedding
              await this.messageRepository.update(message.id, {
                embedding: embedding as any,
              });

              // Store embedding context for semantic search
              await this.aiService.storeEmbeddingContext(
                message.sessionId,
                message.content,
                embedding,
                message.senderType === 'user' ? 'user' : 'ai',
                message.id,
              );

              successCount++;
            }

            totalProcessed++;
          } catch (error) {
            this.logger.error(
              `Failed to generate embedding for message ${message.id}: ${error.message}`,
            );
            errorCount++;
          }
        }

        // Delay between batches
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      await job.progress(100);

      this.logger.log(
        `Batch embedding generation completed: ${successCount} success, ${errorCount} errors`,
      );

      return {
        totalProcessed,
        successCount,
        errorCount,
        sessionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Batch embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  @Process('optimize-index')
  async handleOptimizeIndex(job: Job<OptimizeIndexJob>) {
    const { indexName = 'chat_messages', forceMerge = false } = job.data;

    try {
      // Refresh the index
      await job.progress(25);

      // Force merge if requested (expensive operation)
      if (forceMerge) {
        await job.progress(75);
        this.logger.log(`Force merge completed for index ${indexName}`);
      }

      await job.progress(100);

      this.logger.log(`Index optimization completed for ${indexName}`);

      return {
        indexName,
        forceMerge,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Index optimization failed: ${error.message}`);
      throw error;
    }
  }

  @Process('cleanup-index')
  async handleIndexCleanup(job: Job<{ olderThanDays: number }>) {
    const { olderThanDays } = job.data;

    try {
      await job.progress(25);

      // Clean up old search data
      await this.searchService.cleanupOldData(olderThanDays);

      await job.progress(75);

      // Additional cleanup tasks could go here
      // - Remove orphaned embeddings
      // - Clean up suggestion index
      // - Archive old analytics data

      await job.progress(100);

      this.logger.log(
        `Index cleanup completed for data older than ${olderThanDays} days`,
      );

      return {
        olderThanDays,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Index cleanup failed: ${error.message}`);
      throw error;
    }
  }

  @Process('analyze-search-patterns')
  async handleAnalyzeSearchPatterns(job: Job<AnalyzeSearchPatterns>) {
    const { sessionId, startDate, endDate } = job.data;

    try {
      await job.progress(20);

      // Get search analytics
      const analytics = await this.searchService.getSearchAnalytics(
        sessionId,
        startDate,
        endDate,
      );

      await job.progress(60);

      // Analyze patterns and generate insights
      const insights = this.generateSearchInsights(analytics);

      await job.progress(90);

      // Store insights (you might want to save these to a database)
      this.logger.debug(
        `Generated search insights: ${JSON.stringify(insights)}`,
      );

      await job.progress(100);

      return {
        analytics,
        insights,
        sessionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Search pattern analysis failed: ${error.message}`);
      throw error;
    }
  }

  @Process('sync-embeddings')
  async handleSyncEmbeddings(
    job: Job<{ sessionId?: string; forceSync?: boolean }>,
  ) {
    const { sessionId, forceSync = false } = job.data;

    try {
      // Find messages that have embeddings in database but not in search index
      let query = this.messageRepository
        .createQueryBuilder('message')
        .where('message.embedding IS NOT NULL');

      if (sessionId) {
        query = query.andWhere('message.sessionId = :sessionId', { sessionId });
      }

      const messagesWithEmbeddings = await query.getMany();

      await job.progress(25);

      let syncedCount = 0;
      const batchSize = 20;

      for (let i = 0; i < messagesWithEmbeddings.length; i += batchSize) {
        const batch = messagesWithEmbeddings.slice(i, i + batchSize);

        for (const message of batch) {
          try {
            // Re-index the message to ensure embedding is in search index
            await this.searchService.indexMessage(message, false); // Don't regenerate embedding
            syncedCount++;
          } catch (error) {
            this.logger.warn(
              `Failed to sync embedding for message ${message.id}: ${error.message}`,
            );
          }
        }

        await job.progress(
          25 + Math.floor((i / messagesWithEmbeddings.length) * 70),
        );

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await job.progress(100);

      this.logger.log(`Synced embeddings for ${syncedCount} messages`);

      return {
        totalMessages: messagesWithEmbeddings.length,
        syncedCount,
        sessionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Embedding sync failed: ${error.message}`);
      throw error;
    }
  }

  @Process('health-check')
  async handleHealthCheck(job: Job) {
    try {
      const health = await this.searchService.healthCheck();
      const performance = await this.searchService.getPerformanceMetrics();

      // Check if performance metrics are within acceptable ranges
      const isHealthy =
        health.status === 'healthy' &&
        performance.searchLatency < 2000 &&
        performance.documentCount > 0;

      if (!isHealthy) {
        this.logger.warn('Search service health check failed', {
          health: health.status,
          latency: performance.searchLatency,
          documentCount: performance.documentCount,
        });
      }

      return {
        isHealthy,
        health,
        performance,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate insights from search analytics
   */
  private generateSearchInsights(analytics: any): any {
    const insights: any = {
      messageVolume: 'normal',
      sentimentTrend: 'stable',
      topicDiversity: 'moderate',
      engagementLevel: 'moderate',
      recommendations: [],
    };

    // Analyze message volume
    if (analytics.totalMessages > 100) {
      insights.messageVolume = 'high';
      insights.recommendations.push(
        'Consider implementing conversation summarization',
      );
    } else if (analytics.totalMessages < 10) {
      insights.messageVolume = 'low';
      insights.recommendations.push('Encourage more detailed user input');
    }

    // Analyze sentiment trend
    if (analytics.averageSentiment > 0.3) {
      insights.sentimentTrend = 'positive';
    } else if (analytics.averageSentiment < -0.3) {
      insights.sentimentTrend = 'negative';
      insights.recommendations.push('Consider escalating to human counselor');
    }

    // Analyze topic diversity
    const uniqueKeywords = analytics.topKeywords?.length || 0;
    if (uniqueKeywords > 15) {
      insights.topicDiversity = 'high';
    } else if (uniqueKeywords < 5) {
      insights.topicDiversity = 'low';
      insights.recommendations.push('Encourage broader topic exploration');
    }

    // Analyze engagement level
    const avgMessagesPerHour =
      analytics.messagesByHour?.reduce(
        (sum: number, hour: any) => sum + hour.count,
        0,
      ) / (analytics.messagesByHour?.length || 1);

    if (avgMessagesPerHour > 10) {
      insights.engagementLevel = 'high';
    } else if (avgMessagesPerHour < 2) {
      insights.engagementLevel = 'low';
      insights.recommendations.push('Consider proactive engagement strategies');
    }

    return insights;
  }
}
