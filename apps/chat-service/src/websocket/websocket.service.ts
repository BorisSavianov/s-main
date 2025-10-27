// apps/chat-service/src/websocket/websocket.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

import { SenderType } from '../chat/entities/chat-message.entity';
import { UserService } from 'apps/auth-service/src/auth/user.service';
import { GetUser } from 'apps/auth-service/src/auth/decorators/get-user.decorator';

interface CreateMessageDto {
  sessionId: string;
  senderId?: string;
  senderType: SenderType;
  content: string;
  contentType?: string;
}

@Injectable()
export class WebSocketService {
  private server: Server;
  private readonly logger = new Logger(WebSocketService.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(AiContext)
    private readonly contextRepository: Repository<AiContext>,
    @InjectQueue('message-processing')
    private readonly messageProcessingQueue: Queue,
    @InjectQueue('ai-response')
    private readonly aiResponseQueue: Queue,
    @InjectQueue('analytics')
    private readonly analyticsQueue: Queue,
    @Inject()
    private readonly userService: UserService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  /**
   * Validate if a client can access a session
   */
  async validateSessionAccess(
    sessionId: string,
    client: Socket,
    userId?: string,
  ): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return false;
      }

      // Allow anonymous sessions
      if (session.isAnonymous) {
        return true;
      }

      // Validate user token if provided
      if (userId) {
        try {
          // const authResult = await this.authService
          //   .send('validate_token', { token: userToken })
          //   .toPromise();

          // if (authResult.valid) {

          const authResult = await this.userService.getUserById(userId);
          return (
            authResult.id === session.userId ||
            authResult.id === session.counselorId ||
            authResult.role === 'admin'
          );
          // }
        } catch (error) {
          this.logger.error('Auth service validation failed:', error);
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Session access validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get session information
   */
  async getSessionInfo(sessionId: string): Promise<any> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        select: [
          'id',
          'isAnonymous',
          'isActive',
          'startedAt',
          'overallSentiment',
        ],
      });

      if (!session) {
        throw new Error('Session not found');
      }

      return {
        id: session.id,
        isAnonymous: session.isAnonymous,
        isActive: session.isActive,
        startedAt: session.startedAt,
        overallSentiment: session.overallSentiment,
      };
    } catch (error) {
      this.logger.error(`Get session info failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent messages for a session
   */
  async getRecentMessages(
    sessionId: string,
    limit: number = 20,
  ): Promise<ChatMessage[]> {
    try {
      return await this.messageRepository.find({
        where: { sessionId, isFlagged: false },
        order: { createdAt: 'DESC' },
        take: limit,
        select: [
          'id',
          'senderId',
          'senderType',
          'content',
          'contentType',
          'sentimentScore',
          'createdAt',
        ],
      });
    } catch (error) {
      this.logger.error(`Get recent messages failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a new message
   */
  async createMessage(data: CreateMessageDto): Promise<ChatMessage> {
    try {
      const message = this.messageRepository.create({
        sessionId: data.sessionId,
        senderId: data.senderId,
        senderType: data.senderType,
        content: data.content,
        contentType: data.contentType || 'text',
      }) as ChatMessage;

      const savedMessage = await this.messageRepository.save(message);

      // Queue for AI processing (sentiment analysis, etc.)
      await this.queueMessageForProcessing(savedMessage);

      // Update session activity
      await this.updateSessionActivity(data.sessionId);

      return savedMessage;
    } catch (error) {
      this.logger.error(`Create message failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(
    messageIds: string[],
    userId: string,
  ): Promise<void> {
    try {
      // Queue the read receipt processing
      await this.analyticsQueue.add(
        'messages-read',
        {
          messageIds,
          userId,
          timestamp: new Date(),
        },
        {
          priority: 5, // Medium priority
          delay: 0,
          attempts: 3,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    } catch (error) {
      this.logger.error(`Mark messages as read failed: ${error.message}`);
    }
  }

  /**
   * Determine if AI should respond to a message
   */
  async shouldTriggerAI(
    sessionId: string,
    message: ChatMessage,
  ): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session || !session.isActive) {
        return false;
      }

      // Check if there's a human counselor active
      const counselorActive = await this.isCounselorActive(sessionId);
      if (counselorActive) {
        return false; // Let human counselor handle
      }

      // Check if message is from user
      if (message.senderType != 'user') {
        return false;
      }

      // Check if message contains AI trigger keywords or questions
      const triggerPatterns = [
        /\?/, // Questions
        /help/i,
        /advice/i,
        /what should i/i,
        /how do i/i,
        /feeling/i,
        /anxious/i,
        /depressed/i,
        /sad/i,
      ];

      return triggerPatterns.some((pattern) => pattern.test(message.content));
    } catch (error) {
      this.logger.error(`Should trigger AI check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate AI response
   */
  async generateAIResponse(
    sessionId: string,
    userMessage: string,
    recentMessages: ChatMessage[],
    messageId: string,
  ): Promise<string> {
    try {
      const context = {
        sessionId: sessionId,
        recentMessages: recentMessages,
        userMessage: userMessage,
      };
      // Add AI response job to queue with high priority
      const job = await this.aiResponseQueue.add(
        'generate-response',
        {
          context,
          messageId,
        },
        {
          priority: 1, // High priority
          delay: 0,
          attempts: 3,
          removeOnComplete: 50,
          removeOnFail: 25,
          timeout: 30000, // 30 seconds timeout
        },
      );

      // Wait for the job to complete
      const result = await job.finished();

      return result.content;
    } catch (error) {
      this.logger.error(`Generate AI response failed: ${error.message}`);
      return "I'm sorry, I'm having trouble processing your message right now. Please try again or speak with a human counselor.";
    }
  }

  /**
   * Get AI context for a session
   */
  private async getAIContext(sessionId: string): Promise<AiContext> {
    try {
      let context = await this.contextRepository.findOne({
        where: { sessionId },
      });

      if (!context) {
        context = this.contextRepository.create({
          sessionId,
          contextData: {
            personalityTraits: {
              empathy: 0.8,
              professionalism: 0.9,
              supportiveness: 0.9,
              empathetic: true,
              professional: true,
              supportive: true,
            },
            conversationStyle: 'supportive',
            interactionCount: 0,
            conversationHistory: [],
          },
        });

        await this.contextRepository.save(context);
      }

      return context;
    } catch (error) {
      this.logger.error(`Get AI context failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a counselor is active in session
   */
  private async isCounselorActive(sessionId: string): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        select: ['counselorId'],
      });

      if (session?.counselorId === null || session?.counselorId === undefined) {
        return false;
      }

      // Check with user service if counselor is online
      const counselorStatus = await this.userService.getUserById(
        session!.counselorId,
      );

      return counselorStatus.counselorProfile?.isAvailable!;
    } catch (error) {
      this.logger.error(`Check counselor active failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Update session last activity
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.sessionRepository.update(
        { id: sessionId },
        { updatedAt: new Date() },
      );
    } catch (error) {
      this.logger.error(`Update session activity failed: ${error.message}`);
    }
  }

  /**
   * Queue message for processing using Bull
   */
  private async queueMessageForProcessing(message: ChatMessage): Promise<void> {
    try {
      // Queue for sentiment analysis with high priority
      await this.messageProcessingQueue.add(
        'analyze-sentiment',
        {
          messageId: message.id,
          content: message.content,
          sessionId: message.sessionId,
        },
        {
          priority: 2,
          delay: 0,
          attempts: 3,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      // Queue for content moderation with highest priority
      await this.messageProcessingQueue.add(
        'moderate-content',
        {
          messageId: message.id,
          content: message.content,
          sessionId: message.sessionId,
          senderId: message.senderId,
          senderType: message.senderType,
        },
        {
          priority: 1, // Highest priority for safety
          delay: 0,
          attempts: 2,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      // Queue for search indexing with lower priority
      await this.messageProcessingQueue.add(
        'index-message',
        {
          messageId: message.id,
          sessionId: message.sessionId,
          content: message.content,
          senderType: message.senderType,
        },
        {
          priority: 10, // Lower priority
          delay: 5000, // 5 second delay
          attempts: 2,
          removeOnComplete: 50,
          removeOnFail: 25,
        },
      );

      // Queue analytics update
      await this.analyticsQueue.add(
        'update-session-metrics',
        {
          sessionId: message.sessionId,
          messageId: message.id,
          senderType: message.senderType,
        },
        {
          priority: 8,
          delay: 2000, // 2 second delay
          attempts: 2,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    } catch (error) {
      this.logger.error(`Queue message processing failed: ${error.message}`);
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, reason: string): Promise<void> {
    try {
      await this.sessionRepository.update(
        { id: sessionId },
        {
          isActive: false,
          endedAt: new Date(),
          summary: `Session ended: ${reason}`,
        },
      );

      // Queue session cleanup and analytics
      await this.analyticsQueue.add(
        'session-ended',
        {
          sessionId,
          reason,
          endedAt: new Date(),
        },
        {
          priority: 3,
          delay: 0,
          attempts: 2,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      // Notify all clients in the session
      this.server?.to(sessionId).emit('sessionEnded', { sessionId, reason });

      this.logger.log(`Session ${sessionId} ended: ${reason}`);
    } catch (error) {
      this.logger.error(`End session failed: ${error.message}`);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<any> {
    try {
      const messageCount = await this.messageRepository.count({
        where: { sessionId },
      });

      const avgSentiment = await this.messageRepository
        .createQueryBuilder('message')
        .select('AVG(message.sentimentScore)', 'avgSentiment')
        .where('message.sessionId = :sessionId', { sessionId })
        .getRawOne();

      const senderCounts = await this.messageRepository
        .createQueryBuilder('message')
        .select('message.senderType, COUNT(*) as count')
        .where('message.sessionId = :sessionId', { sessionId })
        .groupBy('message.senderType')
        .getRawMany();

      return {
        messageCount,
        avgSentiment: parseFloat(avgSentiment.avgSentiment) || 0,
        senderCounts,
      };
    } catch (error) {
      this.logger.error(`Get session stats failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Add job to queue for AI response processing with callback
   */
  async queueAIResponse(
    sessionId: string,
    userMessage: string,
    recentMessages: ChatMessage[],
    messageId: string,
    callback?: (response: string) => void,
  ): Promise<void> {
    try {
      const context = {
        sessionId: sessionId,
        recentMessages: recentMessages,
        userMessage: userMessage,
        messageId: recentMessages.at(0)?.id,
      };

      const job = await this.aiResponseQueue.add(
        'generate-response',
        {
          context,
          messageId,
        },
        {
          priority: 1,
          delay: 0,
          attempts: 3,
          removeOnComplete: 50,
          removeOnFail: 25,
          timeout: 30000,
        },
      );

      // If callback provided, wait for completion
      if (callback) {
        job
          .finished()
          .then((result) => {
            callback(result.content);
          })
          .catch((error) => {
            this.logger.error(`AI response job failed: ${error.message}`);
            callback(
              "I'm sorry, I'm having trouble processing your message right now. Please try again or speak with a human counselor.",
            );
          });
      }
    } catch (error) {
      this.logger.error(`Queue AI response failed: ${error.message}`);
      if (callback) {
        callback(
          "I'm sorry, I'm having trouble processing your message right now. Please try again or speak with a human counselor.",
        );
      }
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  async getQueueStats(): Promise<any> {
    try {
      const messageProcessingStats =
        await this.messageProcessingQueue.getJobCounts();
      const aiResponseStats = await this.aiResponseQueue.getJobCounts();
      const analyticsStats = await this.analyticsQueue.getJobCounts();

      return {
        messageProcessing: messageProcessingStats,
        aiResponse: aiResponseStats,
        analytics: analyticsStats,
        totalJobs: {
          waiting:
            messageProcessingStats.waiting +
            aiResponseStats.waiting +
            analyticsStats.waiting,
          active:
            messageProcessingStats.active +
            aiResponseStats.active +
            analyticsStats.active,
          completed:
            messageProcessingStats.completed +
            aiResponseStats.completed +
            analyticsStats.completed,
          failed:
            messageProcessingStats.failed +
            aiResponseStats.failed +
            analyticsStats.failed,
        },
      };
    } catch (error) {
      this.logger.error(`Get queue stats failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear failed jobs from queues
   */
  async clearFailedJobs(): Promise<void> {
    try {
      await Promise.all([
        this.messageProcessingQueue.clean(0, 'failed'),
        this.aiResponseQueue.clean(0, 'failed'),
        this.analyticsQueue.clean(0, 'failed'),
      ]);

      this.logger.log('Cleared failed jobs from all queues');
    } catch (error) {
      this.logger.error(`Clear failed jobs failed: ${error.message}`);
    }
  }
}
