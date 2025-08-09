// apps/chat-service/src/websocket/websocket.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { ClientProxy } from '@nestjs/microservices';

import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

import { SenderType } from '../chat/entities/chat-message.entity';

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
    @Inject('AUTH_SERVICE')
    private readonly authService: ClientProxy,
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
    userToken?: string,
  ): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ['user', 'counselor'],
      });

      if (!session) {
        return false;
      }

      // Allow anonymous sessions
      if (session.isAnonymous) {
        return true;
      }

      // Validate user token if provided
      if (userToken) {
        try {
          const authResult = await this.authService
            .send('validate_token', { token: userToken })
            .toPromise();

          if (authResult.valid) {
            return (
              authResult.userId === session.userId ||
              authResult.userId === session.counselorId ||
              authResult.role === 'admin'
            );
          }
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
      // This would typically update a read_receipts table
      // For now, we'll just emit an event
      await this.messageQueue.emit('messages_read', {
        messageIds,
        userId,
        timestamp: new Date(),
      });
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
      if (message.senderType !== 'user') {
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
  ): Promise<string> {
    try {
      // Get or create AI context
      const context = await this.getAIContext(sessionId);

      // Get recent conversation history
      const recentMessages = await this.getRecentMessages(sessionId, 10);

      // Send request to AI service
      const aiResponse = await this.messageQueue
        .send('generate_ai_response', {
          sessionId,
          userMessage,
          context,
          conversationHistory: recentMessages,
        })
        .toPromise();

      // Update AI context with new interaction
      await this.updateAIContext(sessionId, {
        lastUserMessage: userMessage,
        lastAIResponse: aiResponse.content,
        interactionCount: (context.contextData?.interactionCount || 0) + 1,
      });

      return aiResponse.content;
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
   * Update AI context
   */
  private async updateAIContext(
    sessionId: string,
    updates: any,
  ): Promise<void> {
    try {
      await this.contextRepository.update(
        { sessionId },
        {
          contextData: updates,
          updatedAt: new Date(),
        },
      );
    } catch (error) {
      this.logger.error(`Update AI context failed: ${error.message}`);
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

      if (!session?.counselorId) {
        return false;
      }

      // Check with auth service if counselor is online
      const counselorStatus = await this.authService
        .send('get_user_status', { userId: session.counselorId })
        .toPromise();

      return counselorStatus.online && counselorStatus.available;
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
   * Queue message for processing
   */
  private async queueMessageForProcessing(message: ChatMessage): Promise<void> {
    try {
      // Queue for sentiment analysis
      await this.messageQueue.emit('analyze_sentiment', {
        messageId: message.id,
        content: message.content,
      });

      // Queue for content moderation
      await this.messageQueue.emit('moderate_content', {
        messageId: message.id,
        content: message.content,
      });

      // Queue for search indexing
      await this.messageQueue.emit('index_message', {
        messageId: message.id,
      });
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
}
