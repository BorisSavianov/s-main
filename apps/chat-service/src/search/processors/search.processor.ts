// apps/chat-service/src/search/processors/search.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SearchService } from '../search.service';
import { ChatMessage } from '../../chat/entities/chat-message.entity';

interface IndexMessageJob {
  messageId: string;
}

interface BulkIndexJob {
  messageIds: string[];
}

interface ReindexSessionJob {
  sessionId: string;
}

@Processor('search-indexing')
@Injectable()
export class SearchProcessor {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(
    private readonly searchService: SearchService,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
  ) {}

  @Process('index-message')
  async handleIndexMessage(job: Job<IndexMessageJob>) {
    const { messageId } = job.data;

    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      await this.searchService.indexMessage(message);
      this.logger.debug(`Message ${messageId} indexed successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to index message ${messageId}: ${error.message}`,
      );
      throw error;
    }
  }

  @Process('bulk-index')
  async handleBulkIndex(job: Job<BulkIndexJob>) {
    const { messageIds } = job.data;

    try {
      const messages = await this.messageRepository.findByIds(messageIds);
      await this.searchService.bulkIndexMessages(messages);
      this.logger.log(`Bulk indexed ${messages.length} messages`);
    } catch (error) {
      this.logger.error(`Bulk indexing failed: ${error.message}`);
      throw error;
    }
  }

  @Process('reindex-session')
  async handleReindexSession(job: Job<ReindexSessionJob>) {
    const { sessionId } = job.data;

    try {
      const messages = await this.messageRepository.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
      });

      await this.searchService.bulkIndexMessages(messages);
      this.logger.log(
        `Reindexed ${messages.length} messages for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.error(`Session reindexing failed: ${error.message}`);
      throw error;
    }
  }

  @Process('cleanup-index')
  async handleIndexCleanup(job: Job<{ olderThanDays: number }>) {
    const { olderThanDays } = job.data;

    try {
      // This would implement cleanup logic for old search indices
      this.logger.log(
        `Cleaning up search index data older than ${olderThanDays} days`,
      );

      // Implementation would depend on your cleanup requirements
      // For now, just log the operation
    } catch (error) {
      this.logger.error(`Index cleanup failed: ${error.message}`);
      throw error;
    }
  }
}
