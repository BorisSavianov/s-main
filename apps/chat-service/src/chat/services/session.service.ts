// apps/chat-service/src/chat/services/session.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { ChatSession } from '../entities/chat-session.entity';
import { CreateSessionDto, SessionType } from '../dto/create-session.dto';
import { EndSessionDto } from '../dto/end-session.dto';
import { SessionResponseDto } from '../dto/session-response.dto';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly ACTIVE_SESSIONS_KEY = 'active_sessions';
  private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async createSession(
    createSessionDto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    try {
      const sessionToken =
        createSessionDto.sessionToken || this.generateSessionToken();

      const session = this.sessionRepository.create({
        userId: createSessionDto.userId || null,
        counselorId: createSessionDto.counselorId || null,
        sessionToken,
        isAnonymous: createSessionDto.sessionType === SessionType.ANONYMOUS,
        isActive: true,
        startedAt: new Date(),
      });

      const savedSession = await this.sessionRepository.save(session);

      // Cache active session
      await this.cacheActiveSession(savedSession);

      this.logger.log(`Created new session: ${savedSession.id}`);

      return this.mapToResponseDto(savedSession);
    } catch (error) {
      this.logger.error(
        `Failed to create session: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getSession(
    sessionId: string,
    includeMessages = false,
  ): Promise<SessionResponseDto> {
    try {
      // Try cache first
      const cachedSession = await this.getCachedSession(sessionId);
      if (cachedSession && !includeMessages) {
        return cachedSession;
      }

      const relations = includeMessages ? ['messages'] : [];
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations,
        order: includeMessages ? { messages: { createdAt: 'ASC' } } : {},
      });

      if (!session) {
        throw new NotFoundException(`Session with ID ${sessionId} not found`);
      }

      const responseDto = this.mapToResponseDto(session);

      // Update cache
      await this.cacheActiveSession(session);

      return responseDto;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getSessionByToken(sessionToken: string): Promise<SessionResponseDto> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { sessionToken },
      });

      if (!session) {
        throw new NotFoundException(
          `Session with token ${sessionToken} not found`,
        );
      }

      return this.mapToResponseDto(session);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get session by token: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async endSession(endSessionDto: EndSessionDto): Promise<SessionResponseDto> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: endSessionDto.sessionId },
      });

      if (!session) {
        throw new NotFoundException(
          `Session with ID ${endSessionDto.sessionId} not found`,
        );
      }

      if (!session.isActive) {
        this.logger.warn(
          `Attempting to end already inactive session: ${endSessionDto.sessionId}`,
        );
        return this.mapToResponseDto(session);
      }

      session.isActive = false;
      session.endedAt = new Date();

      if (endSessionDto.closingSummary) {
        session.summary = endSessionDto.closingSummary;
      }

      const updatedSession = await this.sessionRepository.save(session);

      // Remove from active sessions cache
      await this.removeFromActiveSessionsCache(session.id);

      this.logger.log(`Ended session: ${session.id}`);

      return this.mapToResponseDto(updatedSession);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to end session: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserActiveSessions(userId: string): Promise<SessionResponseDto[]> {
    try {
      const sessions = await this.sessionRepository.find({
        where: {
          userId,
          isActive: true,
        },
        order: { createdAt: 'DESC' },
        take: 10, // Limit to recent active sessions
      });

      return sessions.map((session) => this.mapToResponseDto(session));
    } catch (error) {
      this.logger.error(
        `Failed to get user active sessions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateSessionSentiment(
    sessionId: string,
    overallSentiment: number,
  ): Promise<void> {
    try {
      await this.sessionRepository.update(sessionId, {
        overallSentiment,
        updatedAt: new Date(),
      });

      // Update cached session if exists
      const cachedSession = await this.getCachedSession(sessionId);
      if (cachedSession) {
        cachedSession.overallSentiment = overallSentiment;
        await this.redis.setex(
          `session:${sessionId}`,
          this.SESSION_TTL,
          JSON.stringify(cachedSession),
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to update session sentiment: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async cleanupInactiveSessions(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 48); // 48 hours ago

      const result = await this.sessionRepository
        .createQueryBuilder()
        .update(ChatSession)
        .set({ isActive: false, endedAt: () => 'CURRENT_TIMESTAMP' })
        .where('is_active = :isActive', { isActive: true })
        .andWhere('updated_at < :cutoffDate', { cutoffDate })
        .execute();

      this.logger.log(`Cleaned up ${result.affected} inactive sessions`);
      return result.affected || 0;
    } catch (error) {
      this.logger.error(
        `Failed to cleanup inactive sessions: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  private async cacheActiveSession(session: ChatSession): Promise<void> {
    try {
      const sessionData = this.mapToResponseDto(session);

      // Cache individual session
      await this.redis.setex(
        `session:${session.id}`,
        this.SESSION_TTL,
        JSON.stringify(sessionData),
      );

      // Add to active sessions set
      if (session.isActive) {
        await this.redis.zadd(this.ACTIVE_SESSIONS_KEY, Date.now(), session.id);
      }
    } catch (error) {
      this.logger.error(
        `Failed to cache session: ${error.message}`,
        error.stack,
      );
    }
  }

  private async getCachedSession(
    sessionId: string,
  ): Promise<SessionResponseDto | null> {
    try {
      const cached = await this.redis.get(`session:${sessionId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      this.logger.error(
        `Failed to get cached session: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  private async removeFromActiveSessionsCache(
    sessionId: string,
  ): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(`session:${sessionId}`),
        this.redis.zrem(this.ACTIVE_SESSIONS_KEY, sessionId),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to remove session from cache: ${error.message}`,
        error.stack,
      );
    }
  }

  private generateSessionToken(): string {
    return `session_${uuidv4().replace(/-/g, '')}`;
  }

  private mapToResponseDto(session: ChatSession): SessionResponseDto {
    return {
      id: session.id,
      userId: session.userId,
      counselorId: session.counselorId,
      sessionToken: session.sessionToken,
      isAnonymous: session.isAnonymous,
      isActive: session.isActive,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      summary: session.summary,
      overallSentiment: session.overallSentiment,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages || [],
    };
  }
}
