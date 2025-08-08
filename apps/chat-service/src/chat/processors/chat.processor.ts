// apps/chat-service/src/chat/processors/chat.processor.ts (continued)
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { AIService } from '../../ai/ai.service';
import { ClientProxy } from '@nestjs/microservices';

// Define interfaces for job data
interface SessionSetupJob {
  sessionId: string;
  userId?: string;
  isAnonymous: boolean;
}

interface WelcomeMessageJob {
  sessionId: string;
}

interface SessionCleanupJob {
  sessionId: string;
  messageCount: number;
  duration: number | null;
}

interface FlagForReviewJob {
  messageId: string;
  sessionId: string;
  flagReason: string;
}

interface ImmediateInterventionJob {
  sessionId: string;
  messageId: string;
  flagType: string;
}

interface CrisisInterventionJob {
  sessionId: string;
  messageId: string;
  crisisType: string;
  confidence: number;
}

interface ContentModerationJob {
  messageId: string;
  content: string;
  sessionId: string;
}

interface SentimentAnalysisJob {
  messageId: string;
  content: string;
}

interface ResponseQualityJob {
  messageId: string;
  sessionId: string;
  content: string;
}

@Processor('chat-processing')
@Injectable()
export class ChatProcessor {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(
    @InjectRepository(ChatSession)
    private chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSessionSummary)
    private chatSessionSummaryRepository: Repository<ChatSessionSummary>,
    private aiService: AIService,
    private eventEmitter: EventEmitter2,
    @Inject('NOTIFICATION_SERVICE') private notificationClient: ClientProxy,
  ) {}

  @Process('session-setup')
  async handleSessionSetup(job: Job<SessionSetupJob>) {
    const { sessionId, userId, isAnonymous } = job.data;

    try {
      this.logger.debug(`Setting up session: ${sessionId}`);

      const session = await this.chatSessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await this.chatSessionRepository.update(sessionId, {
        sessionMetadata: {
          setupComplete: true,
          setupAt: new Date().toISOString(),
          userType: isAnonymous ? 'anonymous' : 'registered',
          initialSetupData: {
            userAgent: 'unknown',
            ipHash: 'unknown',
            referrer: 'direct',
          },
        },
      });

      this.logger.debug(`Session setup completed for: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to setup session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('send-welcome-message')
  async handleSendWelcomeMessage(job: Job<WelcomeMessageJob>) {
    const { sessionId } = job.data;

    try {
      this.logger.debug(`Sending welcome message to session: ${sessionId}`);

      const welcomeMessage = this.chatMessageRepository.create({
        sessionId,
        senderId: null,
        senderType: SenderType.AI,
        content: `Welcome to your confidential mental health support session. 

I'm here to listen and provide support. This is a safe, judgment-free space where you can share your thoughts and feelings.

**Important notes:**
• This conversation is confidential
• I'm an AI assistant, not a replacement for professional therapy
• If you're in crisis, please contact emergency services (911) or a crisis hotline
• You can end this session at any time

How are you feeling today? What would you like to talk about?`,
        contentType: 'text',
      });

      await this.chatMessageRepository.save(welcomeMessage);

      this.logger.debug(`Welcome message sent to session: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send welcome message to ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('session-cleanup')
  async handleSessionCleanup(job: Job<SessionCleanupJob>) {
    const { sessionId, messageCount, duration } = job.data;

    try {
      this.logger.debug(`Cleaning up session: ${sessionId}`);

      const messages = await this.chatMessageRepository.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
      });

      const existingSummary = await this.chatSessionSummaryRepository.findOne({
        where: { sessionId },
      });

      if (!existingSummary && messages.length > 0) {
        const summaryText = await this.aiService.generateSessionSummary(
          messages.map((msg) => ({
            content: msg.content,
            senderType: msg.senderType,
          })),
        );

        const keyTopics = await this.aiService.extractKeyTopics(
          messages.map((msg) => ({
            content: msg.content,
            senderType: msg.senderType,
          })),
        );

        const sentimentScore = await this.aiService.analyzeSessionSentiment(
          messages.map((msg) => msg.content),
        );

        const sessionSummary = this.chatSessionSummaryRepository.create({
          sessionId,
          summaryText,
          keyTopics,
          sentimentAnalysis: { score: sentimentScore },
          recommendations: [],
          createdBy: 'ai',
        });

        await this.chatSessionSummaryRepository.save(sessionSummary);
      }

      if (duration && duration > 24 * 60 * 60) {
        await this.archiveSessionData(sessionId);
      }

      this.logger.debug(`Session cleanup completed for: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('flag-for-review')
  async handleFlagForReview(job: Job<FlagForReviewJob>) {
    const { messageId, sessionId, flagReason } = job.data;

    try {
      this.logger.warn(
        `Flagging message for review: ${messageId} - ${flagReason}`,
      );

      await this.chatMessageRepository.update(messageId, {
        isFlagged: true,
        flagReason: flagReason,
      });

      // Use notification service via microservice
      await this.sendAdminNotification({
        type: 'message_flagged',
        messageId,
        sessionId,
        reason: flagReason,
        severity: 'medium',
      });

      this.logger.debug(`Message flagged for review: ${messageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to flag message for review ${messageId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('immediate-intervention')
  async handleImmediateIntervention(job: Job<ImmediateInterventionJob>) {
    const { sessionId, messageId, flagType } = job.data;

    try {
      this.logger.error(
        `Immediate intervention required for session: ${sessionId}`,
      );

      const interventionMessage = this.chatMessageRepository.create({
        sessionId,
        senderId: null,
        senderType: SenderType.AI,
        content: `I'm concerned about your safety and wellbeing. Please reach out for immediate professional help:

🚨 **Immediate Help:**
• Call 988 (Suicide & Crisis Lifeline)
• Text "HELLO" to 741741 (Crisis Text Line)
• Call 911 for emergencies

🏥 **Find Local Help:**
• Visit your nearest emergency room
• Contact your doctor or therapist
• Call a trusted friend or family member

Your life has value and help is available. Please don't hesitate to reach out.`,
        contentType: 'text',
      });

      await this.chatMessageRepository.save(interventionMessage);

      // Use notification service for admin alert
      await this.sendAdminNotification({
        type: 'crisis_intervention',
        sessionId,
        messageId,
        reason: flagType,
        severity: 'critical',
      });

      this.logger.error(`Immediate intervention processed for: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle immediate intervention for ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('crisis-intervention')
  async handleCrisisIntervention(job: Job<CrisisInterventionJob>) {
    const { sessionId, messageId, crisisType, confidence } = job.data;

    try {
      this.logger.error(
        `Crisis intervention for session: ${sessionId} - ${crisisType}`,
      );

      const crisisMessages = this.getCrisisMessages(crisisType);

      for (const messageContent of crisisMessages) {
        const crisisMessage = this.chatMessageRepository.create({
          sessionId,
          senderId: null,
          senderType: SenderType.AI,
          content: messageContent,
          contentType: 'text',
        });

        await this.chatMessageRepository.save(crisisMessage);
      }

      await this.alertCrisisTeam({
        sessionId,
        messageId,
        crisisType,
        confidence,
      });

      this.logger.error(`Crisis intervention completed for: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle crisis intervention for ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('moderate-content')
  async handleContentModeration(job: Job<ContentModerationJob>) {
    const { messageId, content, sessionId } = job.data;

    try {
      this.logger.debug(`Moderating content for message: ${messageId}`);

      const moderationResult = await this.aiService.shouldFlagMessage(content);

      if (moderationResult.shouldFlag) {
        await this.chatMessageRepository.update(messageId, {
          isFlagged: true,
          flagReason: moderationResult.reason,
        });

        this.eventEmitter.emit('content.flagged', {
          messageId,
          sessionId,
          flagType: moderationResult.reason,
          severity: this.determineSeverity(moderationResult.reason!),
        });

        this.logger.warn(
          `Content flagged: ${messageId} - ${moderationResult.reason}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to moderate content for ${messageId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @Process('analyze-sentiment')
  async handleSentimentAnalysis(job: Job<SentimentAnalysisJob>) {
    const { messageId, content } = job.data;

    try {
      this.logger.debug(`Analyzing sentiment for message: ${messageId}`);

      const sentiment = await this.aiService.analyzeSentiment(content);

      await this.chatMessageRepository.update(messageId, {
        sentimentScore: sentiment,
      });

      this.logger.debug(
        `Sentiment analysis completed for: ${messageId} (score: ${sentiment})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to analyze sentiment for ${messageId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @Process('analyze-response-quality')
  async handleResponseQualityAnalysis(job: Job<ResponseQualityJob>) {
    const { messageId, sessionId, content } = job.data;

    try {
      this.logger.debug(`Analyzing response quality for: ${messageId}`);

      const previousMessages = await this.chatMessageRepository.find({
        where: { sessionId },
        order: { createdAt: 'DESC' },
        skip: 1,
        take: 1,
      });

      const previousMessage = previousMessages[0];

      if (previousMessage) {
        const qualityScore = await this.analyzeResponseQuality(
          previousMessage.content,
          content,
        );

        // Note: This would need a qualityScore field added to the entity
        // For now, we'll just log it
        this.logger.debug(`Response quality score: ${qualityScore}`);
      }

      this.logger.debug(`Response quality analysis completed: ${messageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to analyze response quality for ${messageId}: ${error.message}`,
        error.stack,
      );
    }
  }

  // Helper methods

  private async archiveSessionData(sessionId: string): Promise<void> {
    this.logger.debug(`Archiving data for session: ${sessionId}`);
    // Implementation for archiving old session data
  }

  private async sendAdminNotification(notification: {
    type: string;
    messageId?: string;
    sessionId?: string;
    reason: string;
    severity: string;
  }): Promise<void> {
    try {
      // Send via notification service microservice
      await this.notificationClient
        .emit('admin.notification', {
          type: notification.type,
          messageId: notification.messageId,
          sessionId: notification.sessionId,
          reason: notification.reason,
          severity: notification.severity,
          timestamp: new Date(),
          service: 'chat-service',
        })
        .toPromise();

      this.logger.log('Admin notification sent successfully');
    } catch (error) {
      this.logger.error(`Failed to send admin notification: ${error.message}`);
      // Fallback: could still work without notification service
    }
  }

  private async alertCrisisTeam(alert: {
    sessionId: string;
    messageId: string;
    crisisType: string;
    confidence: number;
  }): Promise<void> {
    try {
      // Send via notification service microservice
      await this.notificationClient
        .emit('crisis.alert', {
          sessionId: alert.sessionId,
          messageId: alert.messageId,
          crisisType: alert.crisisType,
          confidence: alert.confidence,
          timestamp: new Date(),
          service: 'chat-service',
          urgency: 'CRITICAL',
        })
        .toPromise();

      this.logger.log('Crisis team alert sent successfully');
    } catch (error) {
      this.logger.error(`Failed to alert crisis team: ${error.message}`);
      // This is critical, so we might want to have a fallback mechanism
      throw error;
    }
  }

  private getCrisisMessages(crisisType: string): string[] {
    const baseMessage = `I'm very concerned about what you've shared. Your safety and wellbeing are the top priority right now.

🚨 **Please reach out for immediate help:**
• National Suicide Prevention Lifeline: 988
• Crisis Text Line: Text HOME to 741741
• Emergency Services: 911

🤝 **Additional Support:**
• NAMI HelpLine: 1-800-950-NAMI (6264)
• SAMHSA National Helpline: 1-800-662-4357`;

    switch (crisisType) {
      case 'suicide_risk':
        return [
          baseMessage,
          `Remember: Crisis feelings are temporary, but suicide is permanent. You matter, and there are people who want to help you through this difficult time.`,
        ];

      case 'self_harm':
        return [
          baseMessage,
          `Self-harm might feel like it helps in the moment, but there are healthier ways to cope with difficult emotions. Professional counselors can help you learn these skills.`,
        ];

      case 'substance_abuse':
        return [
          baseMessage,
          `Substance use can make mental health challenges more difficult. There are specialized programs that can help with both mental health and substance use concerns.`,
        ];

      default:
        return [baseMessage];
    }
  }

  private determineSeverity(flagReason: string): string {
    const criticalFlags = ['suicide_risk', 'self_harm', 'immediate_danger'];
    const highFlags = ['substance_abuse', 'severe_depression', 'psychosis'];

    if (criticalFlags.some((flag) => flagReason.includes(flag))) {
      return 'critical';
    }

    if (highFlags.some((flag) => flagReason.includes(flag))) {
      return 'high';
    }

    return 'medium';
  }

  private async analyzeResponseQuality(
    userMessage: string,
    aiResponse: string,
  ): Promise<number> {
    // This would use the AI service to analyze response quality
    // For now, return a mock score
    return Math.random() * 0.4 + 0.6; // Random score between 0.6-1.0
  }
}
