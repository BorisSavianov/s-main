// apps/chat-service/src/websocket/processors/analytics.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from '../../chat/entities/chat-session.entity';
import {
  ChatMessage,
  SenderType,
} from '../../chat/entities/chat-message.entity';

@Processor('analytics')
@Injectable()
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
  ) {}

  @Process('messages-read')
  async handleMessagesRead(job: Job<any>) {
    const { messageIds, userId, timestamp } = job.data;

    try {
      this.logger.debug(
        `Processing read receipts for ${messageIds.length} messages`,
      );

      // Store read receipts (implement read_receipts table if needed)
      // For now, just log the activity
      await this.trackReadActivity(messageIds, userId, timestamp);

      return { messageIds, userId, processed: true };
    } catch (error) {
      this.logger.error(`Failed to process read receipts: ${error.message}`);
      throw error;
    }
  }

  @Process('update-session-metrics')
  async handleUpdateSessionMetrics(job: Job<any>) {
    const { sessionId, messageId, senderType } = job.data;

    try {
      this.logger.debug(`Updating session metrics for ${sessionId}`);

      // Update various session metrics
      await this.updateSessionMetrics(sessionId, senderType);

      return { sessionId, updated: true };
    } catch (error) {
      this.logger.error(`Failed to update session metrics: ${error.message}`);
      throw error;
    }
  }

  @Process('session-ended')
  async handleSessionEnded(job: Job<any>) {
    const { sessionId, reason, endedAt } = job.data;

    try {
      this.logger.debug(`Processing session end analytics for ${sessionId}`);

      // Calculate session statistics
      const stats = await this.calculateSessionStats(sessionId);

      // Store session summary
      await this.storeSessionSummary(sessionId, stats, reason, endedAt);

      return { sessionId, stats };
    } catch (error) {
      this.logger.error(
        `Failed to process session end analytics: ${error.message}`,
      );
      throw error;
    }
  }

  private async trackReadActivity(
    messageIds: string[],
    userId: string,
    timestamp: Date,
  ): Promise<void> {
    // Implement read activity tracking
    this.logger.debug(
      `Tracking read activity for user ${userId}: ${messageIds.length} messages`,
    );

    // This would typically involve:
    // 1. Updating a read_receipts table
    // 2. Updating user activity logs
    // 3. Triggering real-time notifications to other session members
  }

  private async updateSessionMetrics(
    sessionId: string,
    senderType: string,
  ): Promise<void> {
    try {
      const messageCount = await this.messageRepository.count({
        where: { sessionId },
      });

      // Update session with current metrics
      await this.sessionRepository.update(sessionId, {
        sessionMetrics: {
          messageCount: messageCount,
        },

        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`Failed to update session metrics: ${error.message}`);
    }
  }

  private async calculateSessionStats(sessionId: string): Promise<any> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) return null;

      const messages = await this.messageRepository.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
      });

      const duration =
        session.endedAt && session.startedAt
          ? session.endedAt.getTime() - session.startedAt.getTime()
          : 0;

      const avgSentiment = messages
        .filter((m) => m.sentimentScore !== null)
        .reduce(
          (sum, m, _, arr) => sum + (m.sentimentScore || 0) / arr.length,
          0,
        );

      return {
        duration,
        totalMessages: messages.length,
        userMessages: messages.filter((m) => m.senderType === 'user').length,
        aiMessages: messages.filter((m) => m.senderType === 'ai').length,
        counselorMessages: messages.filter((m) => m.senderType === 'counselor')
          .length,
        averageSentiment: avgSentiment,
        flaggedMessages: messages.filter((m) => m.isFlagged).length,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate session stats: ${error.message}`);
      return null;
    }
  }

  private async storeSessionSummary(
    sessionId: string,
    stats: any,
    reason: string,
    endedAt: Date,
  ): Promise<void> {
    try {
      const summary = {
        endReason: reason,
        duration: stats?.duration || 0,
        totalMessages: stats?.totalMessages || 0,
        userEngagement: stats?.userMessages / (stats?.totalMessages || 1),
        aiEngagement: stats?.aiMessages / (stats?.totalMessages || 1),
        overallSentiment: stats?.averageSentiment || 0,
        hadIssues: (stats?.flaggedMessages || 0) > 0,
      };

      await this.sessionRepository.update(sessionId, {
        summary: JSON.stringify(summary),
        endedAt,
      });

      this.logger.debug(`Session summary stored for ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to store session summary: ${error.message}`);
    }
  }
}
