// apps/chat-service/src/chat/services/chat-event-handlers.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { AIService } from '../../ai/ai.service';

interface SessionCreatedEvent {
  sessionId: string;
  userId?: string;
  isAnonymous: boolean;
}

interface SessionEndedEvent {
  sessionId: string;
  userId?: string;
  messageCount: number;
  duration: number | null;
}

interface MessageSentEvent {
  messageId: string;
  sessionId: string;
  senderType: string;
  content: string;
}

interface AIResponseGeneratedEvent {
  sessionId: string;
  messageId: string;
  content: string;
}

interface MessageUpdatedEvent {
  messageId: string;
  sessionId: string;
  changes: Record<string, any>;
}

@Injectable()
export class ChatEventHandlersService {
  private readonly logger = new Logger(ChatEventHandlersService.name);

  constructor(
    @InjectRepository(ChatSession)
    private chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSessionSummary)
    private chatSessionSummaryRepository: Repository<ChatSessionSummary>,
    @InjectQueue('chat-processing')
    private chatQueue: Queue,
    @InjectQueue('ai-processing')
    private aiQueue: Queue,
    private aiService: AIService,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('session.created')
  async handleSessionCreated(event: SessionCreatedEvent) {
    try {
      this.logger.debug(`Session created: ${event.sessionId}`);

      // Queue initial setup tasks
      await this.chatQueue.add(
        'session-setup',
        {
          sessionId: event.sessionId,
          userId: event.userId,
          isAnonymous: event.isAnonymous,
        },
        {
          delay: 1000,
          attempts: 3,
        },
      );

      // Send welcome message for anonymous sessions
      if (event.isAnonymous) {
        await this.chatQueue.add(
          'send-welcome-message',
          { sessionId: event.sessionId },
          { delay: 2000 },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle session created event: ${error.message}`,
      );
    }
  }

  @OnEvent('session.ended')
  async handleSessionEnded(event: SessionEndedEvent) {
    try {
      this.logger.debug(`Session ended: ${event.sessionId}`);

      // Queue session summary generation
      await this.aiQueue.add(
        'generate-summary',
        {
          sessionId: event.sessionId,
          messages: await this.getSessionMessages(event.sessionId),
        },
        {
          delay: 5000, // Allow time for any final messages
          attempts: 2,
        },
      );

      // Queue cleanup tasks
      await this.chatQueue.add(
        'session-cleanup',
        {
          sessionId: event.sessionId,
          messageCount: event.messageCount,
          duration: event.duration,
        },
        {
          delay: 10000,
          attempts: 1,
        },
      );

      // Update session metrics
      await this.updateSessionMetrics(event.sessionId, event);
    } catch (error) {
      this.logger.error(
        `Failed to handle session ended event: ${error.message}`,
      );
    }
  }

  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent) {
    try {
      this.logger.debug(`Message sent: ${event.messageId}`);

      // Queue content moderation
      await this.chatQueue.add(
        'moderate-content',
        {
          messageId: event.messageId,
          content: event.content,
          sessionId: event.sessionId,
        },
        {
          priority: 1, // High priority for safety
          attempts: 2,
        },
      );

      // Update session activity
      await this.updateSessionActivity(event.sessionId);

      // Queue sentiment analysis for user messages
      if (event.senderType === 'user') {
        await this.chatQueue.add(
          'analyze-sentiment',
          {
            messageId: event.messageId,
            content: event.content,
          },
          {
            delay: 1000,
            attempts: 2,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle message sent event: ${error.message}`,
      );
    }
  }

  @OnEvent('ai.response.generated')
  async handleAIResponseGenerated(event: AIResponseGeneratedEvent) {
    try {
      this.logger.debug(`AI response generated: ${event.messageId}`);

      // Queue response quality analysis
      await this.chatQueue.add(
        'analyze-response-quality',
        {
          messageId: event.messageId,
          sessionId: event.sessionId,
          content: event.content,
        },
        {
          delay: 2000,
          attempts: 1,
        },
      );

      // Check if intervention might be needed
      await this.checkForInterventionNeeds(event.sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to handle AI response generated event: ${error.message}`,
      );
    }
  }

  @OnEvent('message.updated')
  async handleMessageUpdated(event: MessageUpdatedEvent) {
    try {
      this.logger.debug(`Message updated: ${event.messageId}`);

      // If the message was flagged, queue for review
      if (event.changes.isFlagged) {
        await this.chatQueue.add(
          'flag-for-review',
          {
            messageId: event.messageId,
            sessionId: event.sessionId,
            flagReason: event.changes.flagReason,
          },
          {
            priority: 2,
            attempts: 1,
          },
        );
      }

      // Update session metrics if sentiment changed
      if (event.changes.sentimentScore !== undefined) {
        await this.updateSessionSentiment(event.sessionId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle message updated event: ${error.message}`,
      );
    }
  }

  @OnEvent('content.flagged')
  async handleContentFlagged(event: {
    messageId: string;
    sessionId: string;
    flagType: string;
    severity: string;
  }) {
    try {
      this.logger.warn(
        `Content flagged: ${event.messageId} - ${event.flagType} (${event.severity})`,
      );

      // Update message flag status
      await this.chatMessageRepository.update(event.messageId, {
        isFlagged: true,
        flagReason: event.flagType,
      });

      // For critical flags, queue immediate intervention
      if (event.severity === 'critical') {
        await this.chatQueue.add(
          'immediate-intervention',
          {
            sessionId: event.sessionId,
            messageId: event.messageId,
            flagType: event.flagType,
          },
          {
            priority: 10, // Highest priority
            attempts: 1,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle content flagged event: ${error.message}`,
      );
    }
  }

  @OnEvent('user.crisis.detected')
  async handleCrisisDetected(event: {
    sessionId: string;
    messageId: string;
    crisisType: string;
    confidence: number;
  }) {
    try {
      this.logger.error(
        `Crisis detected in session ${event.sessionId}: ${event.crisisType}`,
      );

      // Immediately flag the session
      await this.chatSessionRepository.update(event.sessionId, {
        requiresIntervention: true,
        interventionReason: `Crisis detected: ${event.crisisType}`,
      });

      // Queue crisis intervention
      await this.chatQueue.add(
        'crisis-intervention',
        {
          sessionId: event.sessionId,
          messageId: event.messageId,
          crisisType: event.crisisType,
          confidence: event.confidence,
        },
        {
          priority: 20, // Maximum priority
          attempts: 1,
          delay: 0, // Immediate
        },
      );

      // Send crisis resources message
      await this.sendCrisisResourcesMessage(event.sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to handle crisis detected event: ${error.message}`,
      );
    }
  }

  /**
   * Get all messages for a session
   */
  private async getSessionMessages(sessionId: string) {
    return this.chatMessageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      select: ['content', 'senderType', 'createdAt'],
    });
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    await this.chatSessionRepository.update(sessionId, {
      updatedAt: new Date(),
    });
  }

  /**
   * Update session metrics after ending
   */
  private async updateSessionMetrics(
    sessionId: string,
    event: SessionEndedEvent,
  ): Promise<void> {
    try {
      // Calculate additional metrics
      const sentimentStats = await this.chatMessageRepository
        .createQueryBuilder('message')
        .select('AVG(message.sentimentScore)', 'avgSentiment')
        .addSelect(
          'COUNT(CASE WHEN message.sentimentScore < -0.3 THEN 1 END)',
          'negativeMessages',
        )
        .addSelect(
          'COUNT(CASE WHEN message.sentimentScore > 0.3 THEN 1 END)',
          'positiveMessages',
        )
        .where('message.sessionId = :sessionId', { sessionId })
        .andWhere('message.sentimentScore IS NOT NULL')
        .getRawOne();

      // Update session with computed metrics
      await this.chatSessionRepository.update(sessionId, {
        totalMessages: event.messageCount,
        averageSentiment: sentimentStats?.avgSentiment || null,
        sessionMetrics: {
          duration: event.duration!,
          messageCount: event.messageCount,
          averageSentiment: sentimentStats?.avgSentiment || null,
          negativeMessages: parseInt(sentimentStats?.negativeMessages || '0'),
          positiveMessages: parseInt(sentimentStats?.positiveMessages || '0'),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update session metrics: ${error.message}`);
    }
  }

  /**
   * Update session sentiment after message changes
   */
  private async updateSessionSentiment(sessionId: string): Promise<void> {
    const result = await this.chatMessageRepository
      .createQueryBuilder('message')
      .select('AVG(message.sentimentScore)', 'avgSentiment')
      .where('message.sessionId = :sessionId', { sessionId })
      .andWhere('message.sentimentScore IS NOT NULL')
      .getRawOne();

    if (result?.avgSentiment) {
      await this.chatSessionRepository.update(sessionId, {
        overallSentiment: parseFloat(result.avgSentiment),
      });
    }
  }

  /**
   * Check if intervention might be needed
   */
  private async checkForInterventionNeeds(sessionId: string): Promise<void> {
    try {
      // Get recent messages for analysis
      const recentMessages = await this.chatMessageRepository.find({
        where: { sessionId },
        order: { createdAt: 'DESC' },
        take: 5,
      });

      const userMessages = recentMessages.filter(
        (msg) => msg.senderType === SenderType.USER,
      );

      // Check for concerning patterns
      const concerningPatterns = [
        /\b(suicide|kill myself|end it all|not worth living)\b/i,
        /\b(hurt myself|self harm|cut myself)\b/i,
        /\b(hopeless|give up|can't go on)\b/i,
      ];

      const hasConcerningContent = userMessages.some((msg) =>
        concerningPatterns.some((pattern) => pattern.test(msg.content)),
      );

      if (hasConcerningContent) {
        // Emit crisis detection event
        this.eventEmitter.emit('user.crisis.detected', {
          sessionId,
          messageId: userMessages[0]?.id,
          crisisType: 'self_harm_indicators',
          confidence: 0.8,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to check intervention needs: ${error.message}`);
    }
  }

  /**
   * Send crisis resources message
   */
  private async sendCrisisResourcesMessage(sessionId: string): Promise<void> {
    try {
      const crisisMessage = this.chatMessageRepository.create({
        sessionId,
        senderId: null,
        senderType: SenderType.SYSTEM,
        content: `I notice you might be going through a difficult time. Please know that help is available:

🚨 **Emergency Resources:**
• National Suicide Prevention Lifeline: 988 or 1-800-273-8255
• Crisis Text Line: Text HOME to 741741
• Emergency Services: 911

🤝 **Support Resources:**
• NAMI HelpLine: 1-800-950-NAMI (6264)
• SAMHSA National Helpline: 1-800-662-4357

You don't have to go through this alone. Please reach out for professional help.`,
        contentType: 'text',
      });

      await this.chatMessageRepository.save(crisisMessage);
    } catch (error) {
      this.logger.error(
        `Failed to send crisis resources message: ${error.message}`,
      );
    }
  }
}
