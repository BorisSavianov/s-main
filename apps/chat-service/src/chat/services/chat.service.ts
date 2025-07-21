// apps/chat-service/src/chat/services/chat.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { CreateSessionDto, SessionType } from '../dto/create-session.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { EndSessionDto } from '../dto/end-session.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { AIService } from '../../ai/ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession)
    private chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSessionSummary)
    private chatSessionSummaryRepository: Repository<ChatSessionSummary>,
    @InjectRepository(MessageAttachment)
    private messageAttachmentRepository: Repository<MessageAttachment>,
    private aiService: AIService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new chat session
   */
  async createSession(
    createSessionDto: CreateSessionDto,
  ): Promise<ChatSession> {
    const sessionToken =
      createSessionDto.sessionToken || this.generateSessionToken();

    // Check if session token already exists
    const existingSession = await this.chatSessionRepository.findOne({
      where: { sessionToken },
    });

    if (existingSession) {
      throw new BadRequestException('Session token already exists');
    }

    const isAnonymous = createSessionDto.sessionType === SessionType.ANONYMOUS;

    const session = this.chatSessionRepository.create({
      userId: createSessionDto.userId || null,
      counselorId: createSessionDto.counselorId || null,
      sessionToken,
      isAnonymous,
      isActive: true,
      startedAt: new Date(),
    });

    const savedSession = await this.chatSessionRepository.save(session);

    // Emit session created event
    this.eventEmitter.emit('session.created', {
      sessionId: savedSession.id,
      userId: savedSession.userId,
      isAnonymous: savedSession.isAnonymous,
    });

    return savedSession;
  }

  /**
   * Get session by ID or token
   */
  async getSession(sessionId: string): Promise<ChatSession> {
    let session: ChatSession | null;

    // Try to find by ID first, then by token
    session = await this.chatSessionRepository.findOne({
      where: { id: sessionId },
      relations: ['messages', 'summaries'],
    });

    if (!session) {
      session = await this.chatSessionRepository.findOne({
        where: { sessionToken: sessionId },
        relations: ['messages', 'summaries'],
      });
    }

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Send a message in a chat session
   */
  async sendMessage(sendMessageDto: SendMessageDto): Promise<ChatMessage> {
    const session = await this.getSession(sendMessageDto.sessionId);

    if (!session.isActive) {
      throw new BadRequestException('Cannot send message to inactive session');
    }

    // Validate sender for user messages
    if (
      sendMessageDto.senderType === SenderType.USER &&
      !sendMessageDto.senderId
    ) {
      throw new BadRequestException('Sender ID required for user messages');
    }

    // Create and save the message
    const message = this.chatMessageRepository.create({
      sessionId: session.id,
      senderId: sendMessageDto.senderId || null,
      senderType: sendMessageDto.senderType,
      content: sendMessageDto.content,
      contentType: sendMessageDto.contentType || 'text',
    });

    const savedMessage = await this.chatMessageRepository.save(message);

    // Handle attachments if provided
    if (sendMessageDto.attachmentIds?.length) {
      await this.attachFilesToMessage(
        savedMessage.id,
        sendMessageDto.attachmentIds,
      );
    }

    // Emit message sent event for async processing
    this.eventEmitter.emit('message.sent', {
      messageId: savedMessage.id,
      sessionId: session.id,
      senderType: savedMessage.senderType,
      content: savedMessage.content,
    });

    // Generate AI response if this was a user message
    if (sendMessageDto.senderType === SenderType.USER) {
      this.generateAIResponse(session.id, savedMessage).catch(console.error);
    }

    return savedMessage;
  }

  /**
   * Generate AI response to user message
   */
  private async generateAIResponse(
    sessionId: string,
    userMessage: ChatMessage,
  ): Promise<void> {
    try {
      // Get recent conversation history
      const recentMessages = await this.chatMessageRepository.find({
        where: { sessionId },
        order: { createdAt: 'DESC' },
        take: 10,
      });

      // Prepare context for AI
      const context = {
        sessionId,
        recentMessages: recentMessages.reverse().map((msg) => ({
          senderType: msg.senderType,
          content: msg.content,
          createdAt: msg.createdAt,
        })),
        userMessage: userMessage.content,
      };

      // Generate AI response
      const aiResponse = await this.aiService.generateResponse(context);

      // Save AI message
      const aiMessage = this.chatMessageRepository.create({
        sessionId,
        senderId: null,
        senderType: SenderType.AI,
        content: aiResponse.content,
        contentType: 'text',
        sentimentScore: aiResponse.sentiment || null,
      });

      await this.chatMessageRepository.save(aiMessage);

      // Emit AI response event
      this.eventEmitter.emit('ai.response.generated', {
        sessionId,
        messageId: aiMessage.id,
        content: aiMessage.content,
      });
    } catch (error) {
      console.error('Failed to generate AI response:', error);
      // Could emit error event or save error message
    }
  }

  /**
   * Get messages with filtering and pagination
   */
  async getMessages(queryDto: QueryMessagesDto) {
    const where: FindOptionsWhere<ChatMessage> = {};

    if (queryDto.sessionId) where.sessionId = queryDto.sessionId;
    if (queryDto.senderId) where.senderId = queryDto.senderId;
    if (queryDto.senderType) where.senderType = queryDto.senderType;
    if (queryDto.flaggedOnly) where.isFlagged = true;

    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .where(where);

    // Date filtering
    if (queryDto.fromDate) {
      queryBuilder.andWhere('message.createdAt >= :fromDate', {
        fromDate: new Date(queryDto.fromDate),
      });
    }
    if (queryDto.toDate) {
      queryBuilder.andWhere('message.createdAt <= :toDate', {
        toDate: new Date(queryDto.toDate),
      });
    }

    // Pagination
    const skip = (queryDto.page! - 1) * queryDto.limit!;
    queryBuilder
      .orderBy('message.createdAt', 'ASC')
      .skip(skip)
      .take(queryDto.limit);

    const [messages, total] = await queryBuilder.getManyAndCount();

    return {
      data: messages,
      pagination: {
        page: queryDto.page,
        limit: queryDto.limit,
        total,
        totalPages: Math.ceil(total / queryDto.limit!),
      },
    };
  }

  /**
   * Update a message
   */
  async updateMessage(
    messageId: string,
    updateDto: UpdateMessageDto,
  ): Promise<ChatMessage> {
    const message = await this.chatMessageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    Object.assign(message, updateDto);
    const updatedMessage = await this.chatMessageRepository.save(message);

    // Emit message updated event
    this.eventEmitter.emit('message.updated', {
      messageId: updatedMessage.id,
      sessionId: updatedMessage.sessionId,
      changes: updateDto,
    });

    return updatedMessage;
  }

  /**
   * End a chat session
   */
  async endSession(endSessionDto: EndSessionDto): Promise<ChatSession> {
    const session = await this.getSession(endSessionDto.sessionId);

    if (!session.isActive) {
      throw new BadRequestException('Session is already ended');
    }

    session.isActive = false;
    session.endedAt = new Date();
    session.summary = endSessionDto.closingSummary || null;

    const updatedSession = await this.chatSessionRepository.save(session);

    // Emit session ended event for async processing (summary generation, etc.)
    this.eventEmitter.emit('session.ended', {
      sessionId: updatedSession.id,
      userId: updatedSession.userId,
      messageCount: await this.getMessageCount(updatedSession.id),
      duration: this.calculateSessionDuration(updatedSession),
    });

    return updatedSession;
  }

  /**
   * Get user's sessions
   */
  async getUserSessions(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<ChatSession[]> {
    return this.chatSessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['messages'],
    });
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string) {
    const session = await this.getSession(sessionId);
    const messageCount = await this.getMessageCount(sessionId);

    const sentimentStats = await this.chatMessageRepository
      .createQueryBuilder('message')
      .select('AVG(message.sentimentScore)', 'averageSentiment')
      .addSelect('COUNT(*)', 'totalMessages')
      .where('message.sessionId = :sessionId', { sessionId })
      .andWhere('message.sentimentScore IS NOT NULL')
      .getRawOne();

    return {
      sessionId,
      messageCount,
      duration: this.calculateSessionDuration(session),
      averageSentiment: parseFloat(sentimentStats?.averageSentiment) || null,
      isActive: session.isActive,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  /**
   * Search messages semantically (placeholder - requires vector DB setup)
   */
  async searchMessages(query: string, sessionId?: string, limit = 10) {
    // This would use vector similarity search with pgvector
    // For now, implementing basic text search
    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('message')
      .where('message.content ILIKE :query', { query: `%${query}%` });

    if (sessionId) {
      queryBuilder.andWhere('message.sessionId = :sessionId', { sessionId });
    }

    const messages = await queryBuilder
      .orderBy('message.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return {
      query,
      results: messages,
      count: messages.length,
    };
  }

  // Helper methods
  private generateSessionToken(): string {
    return `session_${uuidv4()}`;
  }

  private async getMessageCount(sessionId: string): Promise<number> {
    return this.chatMessageRepository.count({ where: { sessionId } });
  }

  private calculateSessionDuration(session: ChatSession): number | null {
    if (!session.endedAt) return null;
    return Math.floor(
      (session.endedAt.getTime() - session.startedAt.getTime()) / 1000,
    );
  }

  private async attachFilesToMessage(
    messageId: string,
    attachmentIds: string[],
  ): Promise<void> {
    // Implementation would update attachment records to link them to the message
    // This is a placeholder for file attachment logic
    console.log(
      `Attaching files ${attachmentIds.join(', ')} to message ${messageId}`,
    );
  }
}
