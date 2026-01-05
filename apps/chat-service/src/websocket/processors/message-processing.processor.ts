// apps/chat-service/src/websocket/processors/message-processing.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../../chat/entities/chat-message.entity';
import { ChatSession } from '../../chat/entities/chat-session.entity';

@Processor('message-processing')
@Injectable()
export class MessageProcessingProcessor {
  private readonly logger = new Logger(MessageProcessingProcessor.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
  ) {}

  @Process('analyze-sentiment')
  async handleSentimentAnalysis(job: Job<any>) {
    const { messageId, content, sessionId } = job.data;

    try {
      this.logger.debug(
        `Processing sentiment analysis for message ${messageId}`,
      );

      // Simple sentiment analysis (replace with actual AI service call)
      const sentimentScore = await this.analyzeSentiment(content);

      // Update message with sentiment score
      await this.messageRepository.update(messageId, {
        sentimentScore,
      });

      // Update session overall sentiment if needed
      await this.updateSessionSentiment(sessionId);

      this.logger.debug(
        `Sentiment analysis completed for message ${messageId}: ${sentimentScore}`,
      );

      return { messageId, sentimentScore };
    } catch (error) {
      this.logger.error(
        `Sentiment analysis failed for message ${messageId}: ${error.message}`,
      );
      throw error;
    }
  }

  // @Process('moderate-content')
  // async handleContentModeration(job: Job<any>) {
  //   const { messageId, content, sessionId, senderId, senderType } = job.data;

  //   try {
  //     this.logger.debug(
  //       `Processing content moderation for message ${messageId}`,
  //     );

  //     // Content moderation logic
  //     const moderationResult = await this.moderateContent(content);

  //     if (moderationResult.flagged) {
  //       // Flag the message
  //       await this.messageRepository.update(messageId, {
  //         isFlagged: true,
  //         flagReason: moderationResult.reason,
  //         moderatedAt: new Date(),
  //       });

  //       // If severely inappropriate, potentially flag the session
  //       if (moderationResult.severity === 'high') {
  //         await this.sessionRepository.update(sessionId, {
  //           isFlagged: true,
  //           flagReason: `Message flagged: ${moderationResult.reason}`,
  //         });
  //       }

  //       this.logger.warn(
  //         `Message ${messageId} flagged: ${moderationResult.reason}`,
  //       );
  //     }

  //     return {
  //       messageId,
  //       flagged: moderationResult.flagged,
  //       reason: moderationResult.reason,
  //     };
  //   } catch (error) {
  //     this.logger.error(
  //       `Content moderation failed for message ${messageId}: ${error.message}`,
  //     );
  //     throw error;
  //   }
  // }

  private async analyzeSentiment(content: string): Promise<number> {
    // Simple sentiment analysis - replace with actual AI service
    const positiveWords = [
      'good',
      'great',
      'happy',
      'better',
      'thanks',
      'helpful',
      'positive',
    ];
    const negativeWords = [
      'bad',
      'terrible',
      'sad',
      'worse',
      'depressed',
      'anxious',
      'negative',
    ];

    const words = content.toLowerCase().split(/\s+/);
    let score = 0;

    words.forEach((word) => {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    });

    // Normalize to -1 to 1 range
    return Math.max(-1, Math.min(1, (score / words.length) * 10));
  }

  private async moderateContent(
    content: string,
  ): Promise<{ flagged: boolean; reason?: string; severity?: string }> {
    // Simple content moderation - replace with actual moderation service
    const inappropriatePatterns = [
      {
        pattern: /\b(suicide|kill myself)\b/i,
        severity: 'high',
        reason: 'Self-harm content',
      },
      {
        pattern: /\b(hate|violence)\b/i,
        severity: 'medium',
        reason: 'Aggressive content',
      },
      {
        pattern: /\b(spam|advertisement)\b/i,
        severity: 'low',
        reason: 'Spam content',
      },
    ];

    for (const { pattern, severity, reason } of inappropriatePatterns) {
      if (pattern.test(content)) {
        return { flagged: true, reason, severity };
      }
    }

    return { flagged: false };
  }

  private async updateSessionSentiment(sessionId: string): Promise<void> {
    try {
      const avgSentiment = await this.messageRepository
        .createQueryBuilder('message')
        .select('AVG(message.sentimentScore)', 'avgSentiment')
        .where('message.sessionId = :sessionId', { sessionId })
        .andWhere('message.sentimentScore IS NOT NULL')
        .getRawOne();

      if (avgSentiment.avgSentiment !== null) {
        await this.sessionRepository.update(sessionId, {
          overallSentiment: parseFloat(avgSentiment.avgSentiment),
        });
      }
    } catch (error) {
      this.logger.error(`Failed to update session sentiment: ${error.message}`);
    }
  }
}
