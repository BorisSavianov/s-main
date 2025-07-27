// apps/chat-service/src/search/listeners/search-event.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { SearchService } from '../search.service';

interface MessageSentEvent {
  messageId: string;
  sessionId: string;
  senderType: 'user' | 'ai' | 'counselor';
  content: string;
}

interface MessageUpdatedEvent {
  messageId: string;
  sessionId: string;
  changes: {
    content?: string;
    sentimentScore?: number;
    isFlagged?: boolean;
    flagReason?: string;
  };
}

interface SessionEndedEvent {
  sessionId: string;
  userId?: string;
  messageCount: number;
  duration?: number;
}

interface AIResponseGeneratedEvent {
  sessionId: string;
  messageId: string;
  content: string;
}

@Injectable()
export class SearchEventListener {
  private readonly logger = new Logger(SearchEventListener.name);

  constructor(
    private readonly searchService: SearchService,
    @InjectQueue('search-indexing')
    private readonly indexingQueue: Queue,
  ) {}

  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent) {
    try {
      const { messageId, senderType, content } = event;

      // Skip empty messages
      if (!content || content.trim().length === 0) {
        return;
      }

      // Determine priority based on sender type and content length
      let priority = 0;
      if (senderType === 'user') {
        priority = 1; // Higher priority for user messages
      }
      if (content.length > 200) {
        priority += 1; // Higher priority for longer messages
      }

      // Queue message for indexing with appropriate delay
      await this.indexingQueue.add(
        'index-message',
        {
          messageId,
          generateEmbedding: true,
        },
        {
          priority,
          delay: senderType === 'ai' ? 2000 : 500, // Delay AI messages slightly
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );

      this.logger.debug(
        `Queued message ${messageId} for indexing with priority ${priority}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle message sent event: ${error.message}`,
      );
    }
  }

  @OnEvent('message.updated')
  async handleMessageUpdated(event: MessageUpdatedEvent) {
    try {
      const { messageId, changes } = event;

      // Only update index if relevant fields changed
      const relevantChanges = [
        'content',
        'sentimentScore',
        'isFlagged',
        'flagReason',
      ];
      const hasRelevantChanges = Object.keys(changes).some((key) =>
        relevantChanges.includes(key),
      );

      if (!hasRelevantChanges) {
        return;
      }

      // Update the message in the search index
      await this.searchService.updateMessage(messageId, changes);

      this.logger.debug(`Updated message ${messageId} in search index`);
    } catch (error) {
      this.logger.error(
        `Failed to handle message updated event: ${error.message}`,
      );
    }
  }

  @OnEvent('message.deleted')
  async handleMessageDeleted(event: { messageId: string }) {
    try {
      const { messageId } = event;

      // Remove message from search index
      await this.searchService.deleteMessage(messageId);

      this.logger.debug(`Removed message ${messageId} from search index`);
    } catch (error) {
      this.logger.error(
        `Failed to handle message deleted event: ${error.message}`,
      );
    }
  }

  @OnEvent('session.created')
  async handleSessionCreated(event: {
    sessionId: string;
    userId?: string;
    isAnonymous: boolean;
  }) {
    try {
      const { sessionId, isAnonymous } = event;

      // Initialize session-specific search analytics
      this.logger.debug(
        `Session ${sessionId} created (anonymous: ${isAnonymous})`,
      );

      // Could initialize session-specific suggestion contexts here
    } catch (error) {
      this.logger.error(
        `Failed to handle session created event: ${error.message}`,
      );
    }
  }

  @OnEvent('session.ended')
  async handleSessionEnded(event: SessionEndedEvent) {
    try {
      const { sessionId, messageCount, duration } = event;

      if (messageCount === 0) {
        this.logger.debug(`Session ${sessionId} ended with no messages`);
        return;
      }

      // Queue comprehensive session analysis
      await this.indexingQueue.add(
        'analyze-search-patterns',
        { sessionId },
        {
          delay: 5000, // Wait a bit for all messages to be indexed
          attempts: 2,
          priority: -1, // Lower priority
        },
      );

      // Generate batch embeddings for any messages that might have been missed
      await this.indexingQueue.add(
        'batch-generate-embeddings',
        { sessionId },
        {
          delay: 10000,
          attempts: 2,
          priority: -2,
        },
      );

      this.logger.debug(
        `Queued session analysis for ${sessionId} (${messageCount} messages, ${duration}s duration)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle session ended event: ${error.message}`,
      );
    }
  }

  @OnEvent('ai.response.generated')
  async handleAIResponseGenerated(event: AIResponseGeneratedEvent) {
    try {
      const { sessionId, messageId, content } = event;

      // AI responses might need special handling for indexing
      // They could include generated insights or recommendations

      // Check if this is a special AI response that needs immediate indexing
      const isImportantResponse =
        content.length > 500 ||
        content.includes('recommendation') ||
        content.includes('summary');

      if (isImportantResponse) {
        await this.indexingQueue.add(
          'index-message',
          {
            messageId,
            generateEmbedding: true,
          },
          {
            priority: 2, // High priority for important AI responses
            delay: 1000,
            attempts: 3,
          },
        );
      }

      this.logger.debug(
        `AI response generated for session ${sessionId}: ${messageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle AI response generated event: ${error.message}`,
      );
    }
  }

  @OnEvent('user.flagged')
  async handleUserFlagged(event: {
    userId: string;
    reason: string;
    sessionId?: string;
  }) {
    try {
      const { userId, reason, sessionId } = event;

      // When a user is flagged, we might want to review their message history
      if (sessionId) {
        // Queue reindexing of the session to update flagged status
        await this.indexingQueue.add(
          'reindex-session',
          { sessionId },
          {
            priority: 3, // High priority for safety-related indexing
            attempts: 2,
          },
        );
      }

      this.logger.warn(
        `User ${userId} flagged: ${reason} (session: ${sessionId})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle user flagged event: ${error.message}`,
      );
    }
  }

  @OnEvent('search.query.performed')
  async handleSearchQueryPerformed(event: {
    query: string;
    sessionId?: string;
    resultCount: number;
    executionTime: number;
    searchType: 'text' | 'semantic' | 'hybrid';
  }) {
    try {
      const { query, sessionId, resultCount, executionTime, searchType } =
        event;

      // Log search patterns for analytics
      this.logger.debug(
        `Search performed: "${query}" (${searchType}) - ${resultCount} results in ${executionTime}ms`,
      );

      // Update search suggestions based on successful queries
      if (resultCount > 0 && query.length > 2) {
        // This could update a search analytics database
        // For now, we'll just log it
      }

      // If search was slow, consider optimizing
      if (executionTime > 2000) {
        this.logger.warn(
          `Slow search detected: ${executionTime}ms for query "${query}"`,
        );

        // Could queue index optimization
        if (Math.random() < 0.1) {
          // 10% chance to trigger optimization
          await this.indexingQueue.add(
            'optimize-index',
            { forceMerge: false },
            {
              priority: -5, // Very low priority
              delay: 30000, // Wait 30 seconds
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle search query performed event: ${error.message}`,
      );
    }
  }

  @OnEvent('system.maintenance.scheduled')
  async handleSystemMaintenance(event: {
    type: 'cleanup' | 'optimization' | 'reindex';
    scheduledAt: Date;
  }) {
    try {
      const { type, scheduledAt } = event;

      const delay = Math.max(0, scheduledAt.getTime() - Date.now());

      switch (type) {
        case 'cleanup':
          await this.indexingQueue.add(
            'cleanup-index',
            { olderThanDays: 90 },
            {
              delay,
              priority: -10,
              attempts: 1,
            },
          );
          break;

        case 'optimization':
          await this.indexingQueue.add(
            'optimize-index',
            { forceMerge: true },
            {
              delay,
              priority: -8,
              attempts: 1,
            },
          );
          break;

        case 'reindex':
          // This would be for a full system reindex (rare)
          this.logger.warn(
            'Full system reindex scheduled - this is a heavy operation',
          );
          break;
      }

      this.logger.log(
        `Scheduled ${type} maintenance for ${scheduledAt.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle system maintenance event: ${error.message}`,
      );
    }
  }

  @OnEvent('embedding.batch.requested')
  async handleEmbeddingBatchRequested(event: {
    sessionIds?: string[];
    messageIds?: string[];
    priority?: number;
  }) {
    try {
      const { sessionIds, messageIds, priority = 0 } = event;

      if (sessionIds && sessionIds.length > 0) {
        for (const sessionId of sessionIds) {
          await this.indexingQueue.add(
            'batch-generate-embeddings',
            { sessionId },
            {
              priority,
              attempts: 2,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          );
        }
      }

      if (messageIds && messageIds.length > 0) {
        await this.indexingQueue.add(
          'batch-generate-embeddings',
          { messageIds },
          {
            priority,
            attempts: 2,
          },
        );
      }

      this.logger.debug(`Queued batch embedding generation`);
    } catch (error) {
      this.logger.error(
        `Failed to handle embedding batch requested event: ${error.message}`,
      );
    }
  }

  @OnEvent('search.health.check')
  async handleSearchHealthCheck() {
    try {
      await this.indexingQueue.add(
        'health-check',
        {},
        {
          priority: 5,
          attempts: 1,
          removeOnComplete: 1,
        },
      );

      this.logger.debug('Queued search health check');
    } catch (error) {
      this.logger.error(
        `Failed to handle search health check event: ${error.message}`,
      );
    }
  }

  @OnEvent('search.sync.embeddings')
  async handleSyncEmbeddings(event: {
    sessionId?: string;
    forceSync?: boolean;
  }) {
    try {
      const { sessionId, forceSync = false } = event;

      await this.indexingQueue.add(
        'sync-embeddings',
        { sessionId, forceSync },
        {
          priority: 1,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 10000,
          },
        },
      );

      this.logger.debug(
        `Queued embedding sync${sessionId ? ` for session ${sessionId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle sync embeddings event: ${error.message}`,
      );
    }
  }

  @OnEvent('search.index.corrupted')
  async handleIndexCorrupted(event: { indexName: string; reason: string }) {
    try {
      const { indexName, reason } = event;

      this.logger.error(
        `Search index corruption detected: ${indexName} - ${reason}`,
      );

      // This would trigger emergency procedures
      // - Alert administrators
      // - Queue full reindex
      // - Switch to backup index if available

      // For now, just log the critical issue
      this.logger.error(
        'CRITICAL: Search index corruption requires immediate attention',
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle index corrupted event: ${error.message}`,
      );
    }
  }

  @OnEvent('search.performance.degraded')
  async handlePerformanceDegraded(event: {
    averageLatency: number;
    errorRate: number;
    threshold: number;
  }) {
    try {
      const { averageLatency, errorRate, threshold } = event;

      this.logger.warn(
        `Search performance degraded: ${averageLatency}ms avg latency, ${errorRate}% error rate`,
      );

      // Queue optimization if performance is significantly degraded
      if (averageLatency > threshold * 2) {
        await this.indexingQueue.add(
          'optimize-index',
          { forceMerge: false },
          {
            priority: 2,
            delay: 5000,
          },
        );
      }

      // If error rate is high, queue health check
      if (errorRate > 5) {
        await this.indexingQueue.add(
          'health-check',
          {},
          {
            priority: 3,
            delay: 1000,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle performance degraded event: ${error.message}`,
      );
    }
  }
}
