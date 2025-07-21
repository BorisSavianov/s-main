// src/auth/session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import { RedisService } from '../redis/redis.service';

export interface SessionData {
  sessionId: string;
  userId: string;
  email: string;
  role: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly redisService: RedisService,
  ) {}

  async createSession(
    user: User,
    ipAddress?: string,
    userAgent?: string,
    rememberMe: boolean = false,
  ): Promise<UserSession> {
    const sessionToken = uuidv4();
    const expiresAt = new Date();

    // Set expiration time based on remember me option
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days
    } else {
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours
    }

    // Create session in database
    const session = this.sessionRepository.create({
      sessionToken,
      userId: user.id,
      expiresAt,
      ipAddress,
      userAgent,
      isActive: true,
    });

    const savedSession = await this.sessionRepository.save(session);

    // Store session in Redis for quick access
    const sessionData: SessionData = {
      sessionId: savedSession.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      ipAddress,
      userAgent,
      isActive: true,
      createdAt: savedSession.createdAt,
      expiresAt: savedSession.expiresAt,
    };

    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    await this.redisService.setSession(savedSession.id, sessionData, ttl);

    this.logger.log(`Session created: ${savedSession.id} for user: ${user.id}`);

    return savedSession;
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    // Try to get session from Redis first
    let sessionData =
      await this.redisService.getSession<SessionData>(sessionId);

    if (sessionData) {
      // Check if session is still active and not expired
      if (
        sessionData.isActive &&
        new Date(sessionData.expiresAt) > new Date()
      ) {
        return sessionData;
      } else {
        // Session is expired or inactive, remove from Redis
        await this.redisService.deleteSession(sessionId);
        return null;
      }
    }

    // If not in Redis, check database
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, isActive: true },
      relations: ['user'],
    });

    if (!session || new Date(session.expiresAt) <= new Date()) {
      return null;
    }

    // Restore session to Redis
    sessionData = {
      sessionId: session.id,
      userId: session.userId,
      email: session.user.email,
      role: session.user.role,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isActive: session.isActive,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };

    const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    await this.redisService.setSession(sessionId, sessionData, ttl);

    return sessionData;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    // Mark session as inactive in database
    await this.sessionRepository.update({ id: sessionId }, { isActive: false });

    // Remove from Redis
    await this.redisService.deleteSession(sessionId);

    this.logger.log(`Session invalidated: ${sessionId}`);
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    // Mark all user sessions as inactive in database
    await this.sessionRepository.update(
      { userId, isActive: true },
      { isActive: false },
    );

    // Remove all user sessions from Redis
    await this.redisService.invalidatePattern(`session:*:${userId}`);

    this.logger.log(`All sessions invalidated for user: ${userId}`);
  }

  async extendSession(
    sessionId: string,
    extendBy: number = 3600,
  ): Promise<boolean> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, isActive: true },
    });

    if (!session) {
      return false;
    }

    // Extend session expiration
    const newExpiresAt = new Date(Date.now() + extendBy * 1000);
    await this.sessionRepository.update(sessionId, { expiresAt: newExpiresAt });

    // Update Redis cache
    const sessionData =
      await this.redisService.getSession<SessionData>(sessionId);
    if (sessionData) {
      sessionData.expiresAt = newExpiresAt;
      const ttl = Math.floor((newExpiresAt.getTime() - Date.now()) / 1000);
      await this.redisService.setSession(sessionId, sessionData, ttl);
    }

    this.logger.log(`Session extended: ${sessionId}`);
    return true;
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    return await this.sessionRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getSessionById(sessionId: string): Promise<UserSession | null> {
    return await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });
  }

  async cleanupExpiredSessions(): Promise<void> {
    const expiredSessions = await this.sessionRepository
      .createQueryBuilder('session')
      .where('session.expiresAt < :now', { now: new Date() })
      .orWhere('session.isActive = false')
      .getMany();

    if (expiredSessions.length > 0) {
      // Remove from database
      await this.sessionRepository.remove(expiredSessions);

      // Remove from Redis
      for (const session of expiredSessions) {
        await this.redisService.deleteSession(session.id);
      }

      this.logger.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  async getActiveSessionCount(userId: string): Promise<number> {
    return await this.sessionRepository.count({
      where: { userId, isActive: true },
    });
  }

  async isSessionValid(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session !== null && session.isActive;
  }
}
