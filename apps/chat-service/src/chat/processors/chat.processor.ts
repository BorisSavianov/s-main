// apps/chat-service/src/chat/processors/chat.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { AIService } from '../../ai/ai.service';

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
    private mailerService: MailerService,
  ) {}

  @Process('session-setup')
  async handleSessionSetup(job: Job<SessionSetupJob>) {
    const { sessionId, userId, isAnonymous } = job.data;

    try {
      this.logger.debug(`Setting up session: ${sessionId}`);

      // Initialize session metadata
      const session = await this.chatSessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Set up initial session state
      await this.chatSessionRepository.update(sessionId, {
        sessionMetadata: {
          setupComplete: true,
          setupAt: new Date().toISOString(),
          userType: isAnonymous ? 'anonymous' : 'registered',
          initialSetupData: {
            userAgent: 'unknown', // Would come from request
            ipHash: 'unknown', // Hashed for privacy
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
        senderType: 'system',
        content: `Welcome to your confidential mental health support session. 

I'm here to listen and provide support. This is a safe, judgment-free space where you can share your thoughts and feelings.

**Important notes:**
• This conversation is confidential
• I'm an AI assistant, not a replacement for professional therapy
• If you're in crisis, please contact emergency services (911) or a crisis hotline
• You can end this session at any time

How are you feeling today? What would you like to talk about?`,
        contentType: 'text',
        isSystemMessage: true,
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

      // Perform final session analysis
      const messages = await this.chatMessageRepository.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
      });

      // Generate final session summary if not exists
      const existingSummary = await this.chatSessionSummaryRepository.findOne({
        where: { sessionId },
      });

      if (!existingSummary && messages.length > 0) {
        const summary = await this.aiService.generateSessionSummary(
          messages.map(msg => ({
            content: msg.content,
            senderType: msg.senderType,
          }))
        );

        const keyTopics = await this.aiService.extractKeyTopics(
          messages.map(msg => ({
            content: msg.content,
            senderType: msg.senderType,
          }))
        );

        const sessionSummary = this.chatSessionSummaryRepository.create({
          sessionId,
          summary,
          keyTopics,
          summaryType: 'automatic',
          messageCount,
          sessionDuration: duration,
        });

        await this.chatSessionSummaryRepository.save(sessionSummary);
      }

      // Archive old session data if needed
      if (duration && duration > 24 * 60 * 60) { // Sessions longer than 24 hours
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

      // Update message with review flag
      await this.chatMessageRepository.update(messageId, {
        needsReview: true,
        reviewReason: flagReason,
        reviewRequestedAt: new Date(),
      });

      // Notify administrators if configured
      await this.notifyAdministrators({
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

      // Mark session as requiring immediate attention
      await this.chatSessionRepository.update(sessionId, {
        requiresIntervention: true,
        interventionType: 'immediate',
        interventionReason: flagType,
        interventionRequestedAt: new Date(),
      });

      // Send intervention message
      const interventionMessage = this.chatMessageRepository.create({
        sessionId,
        senderId: null,
        senderType: 'system',
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
        isSystemMessage: true,
        isUrgent: true,
      });

      await this.chatMessageRepository.save(interventionMessage);

      // Notify crisis response team
      await this.notifyAdministrators({
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

      // Update session with crisis flag
      await this.chatSessionRepository.update(sessionId, {
        requiresIntervention: true,
        interventionType: 'crisis',
        interventionReason: `${crisisType} (confidence: ${confidence})`,
        interventionRequestedAt: new Date(),
        isCrisis: true,
      });

      // Send appropriate crisis response based on type
      const crisisMessages = this.getCrisisMessages(crisisType);
      
      for (const messageContent of crisisMessages) {
        const crisisMessage = this.chatMessageRepository.create({
          sessionId,
          senderId: null,
          senderType: 'system',
          content: messageContent,
          contentType: 'text',
          isSystemMessage: true,
          isUrgent: true,
        });

        await this.chatMessageRepository.save(crisisMessage);
      }

      // Alert crisis response team immediately
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
          moderationScore: moderationResult.confidence,
        });

        // Emit content flagged event
        this.eventEmitter.emit('content.flagged', {
          messageId,
          sessionId,
          flagType: moderationResult.reason,
          severity: this.determineSeverity(moderationResult.reason),
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
      // Don't throw - moderation failures shouldn't break the flow
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
      // Don't throw - sentiment analysis failures shouldn't break the flow
    }
  }

  @Process('analyze-response-quality')
  async handleResponseQualityAnalysis(job: Job<ResponseQualityJob>) {
    const { messageId, sessionId, content } = job.data;

    try {
      this.logger.debug(`Analyzing response quality for: ${messageId}`);

      // Get the previous user message for context
      const previousMessage = await this.chatMessageRepository.findOne({
        where: { sessionId },
        order: { createdAt: 'DESC' },
        skip: 1, // Skip the current AI message
      });

      if (previousMessage) {
        // This would use a more sophisticated quality analysis
        const qualityScore = await this.analyzeResponseQuality(
          previousMessage.content,
          content,
        );

        await this.chatMessageRepository.update(messageId, {
          qualityScore,
          qualityAnalyzedAt: new Date(),
        });
      }

      this.logger.debug(`Response quality analysis completed: ${messageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to analyze response quality for ${messageId}: ${error.message}`,
        error.stack,
      );
      // Don't throw - quality analysis failures shouldn't break the flow
    }
  }

  // Helper methods

  private async archiveSessionData(sessionId: string): Promise<void> {
    // Implementation for archiving old session data
    // This could move data to a separate archive table or external storage
    this.logger.debug(`Archiving data for session: ${sessionId}`);
    // Placeholder for actual archiving logic
  }

  private async notifyAdministrators(notification: {
    type: string;
    messageId?: string;
    sessionId?: string;
    reason: string;
    severity: string;
  }): Promise<void> {
    try {
      // Send email notification to administrators
      await this.mailerService.sendMail({
        to: process.env.ADMIN_EMAIL || 'admin@example.com',
        subject: `[${notification.severity.toUpperCase()}] Chat Service Alert`,
        template: 'admin-notification',
        context: notification,
      });
    } catch (error) {
      this.logger.error(`Failed to notify administrators: ${error.message}`);
    }
  }

  private async alertCrisisTeam(alert: {
    sessionId: string;
    messageId: string;
    crisisType: string;
    confidence: number;
  }): Promise<void> {
    try {
      // Send immediate alert to crisis response team
      await this.mailerService.sendMail({
        to: process.env.CRISIS_TEAM_EMAIL || 'crisis@example.com',
        subject: '🚨 URGENT - Crisis Intervention Required',
        template: 'crisis-alert',
        context: alert,
      });

      // Could also