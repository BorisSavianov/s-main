// apps/chat-service/src/chat/services/counselor-queue.service.ts
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from 'apps/auth-service/src/redis/redis.service';
import { CounselorQueue, QueueStatus } from '../entities/counselor-queue.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

const QUEUE_CACHE_KEY = 'counselor:queue';
const QUEUE_TTL = 3600; // 1 hour TTL for queue entries

export interface QueueStatusResponse {
  status: QueueStatus;
  position?: number;
  joinedAt?: Date;
  matchedSessionId?: string;
}

@Injectable()
export class CounselorQueueService {
  private readonly logger = new Logger(CounselorQueueService.name);

  constructor(
    @InjectRepository(CounselorQueue)
    private readonly queueRepository: Repository<CounselorQueue>,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Add counselor to the waiting queue
   */
  async joinQueue(counselorId: string): Promise<CounselorQueue> {
    // Check if counselor is already in queue
    const existing = await this.queueRepository.findOne({
      where: { counselorId, status: QueueStatus.WAITING },
    });

    if (existing) {
      throw new ConflictException('Counselor is already in the queue');
    }

    // Create new queue entry
    const queueEntry = this.queueRepository.create({
      counselorId,
      status: QueueStatus.WAITING,
    });

    const saved = await this.queueRepository.save(queueEntry);

    // Add to Redis for fast lookups
    await this.addToRedisQueue(counselorId);

    this.logger.log(`Counselor ${counselorId} joined the queue`);
    
    // Emit event for real-time updates
    this.eventEmitter.emit('counselor.queue.joined', { counselorId });

    return saved;
  }

  /**
   * Remove counselor from the queue
   */
  async leaveQueue(counselorId: string): Promise<void> {
    const queueEntry = await this.queueRepository.findOne({
      where: { counselorId, status: QueueStatus.WAITING },
    });

    if (!queueEntry) {
      throw new NotFoundException('Counselor is not in the queue');
    }

    queueEntry.status = QueueStatus.LEFT;
    await this.queueRepository.save(queueEntry);

    // Remove from Redis
    await this.removeFromRedisQueue(counselorId);

    this.logger.log(`Counselor ${counselorId} left the queue`);
    
    this.eventEmitter.emit('counselor.queue.left', { counselorId });
  }

  /**
   * Find a random available counselor from the queue
   */
  async findAvailableCounselor(): Promise<CounselorQueue | null> {
    // First try Redis for faster lookup
    const counselorIds = await this.getRedisQueueMembers();
    
    if (counselorIds.length === 0) {
      return null;
    }

    // Pick a random counselor from the available ones
    const randomIndex = Math.floor(Math.random() * counselorIds.length);
    const selectedCounselorId = counselorIds[randomIndex];

    // Verify in database
    const queueEntry = await this.queueRepository.findOne({
      where: { 
        counselorId: selectedCounselorId, 
        status: QueueStatus.WAITING 
      },
    });

    if (!queueEntry) {
      // Redis was stale, remove and try again
      await this.removeFromRedisQueue(selectedCounselorId);
      return this.findAvailableCounselor();
    }

    return queueEntry;
  }

  /**
   * Match a counselor with a user session
   */
  async matchCounselor(counselorId: string, sessionId: string): Promise<CounselorQueue> {
    const queueEntry = await this.queueRepository.findOne({
      where: { counselorId, status: QueueStatus.WAITING },
    });

    if (!queueEntry) {
      throw new NotFoundException('Counselor is not available');
    }

    queueEntry.status = QueueStatus.MATCHED;
    queueEntry.matchedAt = new Date();
    queueEntry.matchedSessionId = sessionId;

    const updated = await this.queueRepository.save(queueEntry);

    // Remove from Redis queue since they're now matched
    await this.removeFromRedisQueue(counselorId);

    this.logger.log(`Counselor ${counselorId} matched with session ${sessionId}`);
    
    this.eventEmitter.emit('counselor.queue.matched', { 
      counselorId, 
      sessionId 
    });

    return updated;
  }

  /**
   * Get queue status for a counselor
   */
  async getQueueStatus(counselorId: string): Promise<QueueStatusResponse> {
    const queueEntry = await this.queueRepository.findOne({
      where: { counselorId },
      order: { joinedAt: 'DESC' },
    });

    if (!queueEntry) {
      return { status: QueueStatus.LEFT }; // Not in queue
    }

    if (queueEntry.status === QueueStatus.WAITING) {
      const position = await this.getQueuePosition(counselorId);
      return {
        status: queueEntry.status,
        position,
        joinedAt: queueEntry.joinedAt,
      };
    }

    if (queueEntry.status === QueueStatus.MATCHED) {
      return {
        status: queueEntry.status,
        matchedSessionId: queueEntry.matchedSessionId!,
      };
    }

    return { status: queueEntry.status };
  }

  /**
   * Get position in queue
   */
  async getQueuePosition(counselorId: string): Promise<number> {
    const entry = await this.queueRepository.findOne({
      where: { counselorId, status: QueueStatus.WAITING },
    });

    if (!entry) return -1;

    const count = await this.queueRepository.count({
      where: { status: QueueStatus.WAITING },
    });

    // Simple position based on count (FIFO order would need more complex query)
    return count;
  }

  /**
   * Get count of counselors in queue
   */
  async getQueueCount(): Promise<number> {
    const redisCount = await this.redisService.scard(QUEUE_CACHE_KEY);
    if (redisCount > 0) return redisCount;

    return this.queueRepository.count({
      where: { status: QueueStatus.WAITING },
    });
  }

  // Redis helper methods
  private async addToRedisQueue(counselorId: string): Promise<void> {
    try {
      await this.redisService.sadd(QUEUE_CACHE_KEY, counselorId);
      await this.redisService.expire(QUEUE_CACHE_KEY, QUEUE_TTL);
    } catch (error) {
      this.logger.warn(`Failed to add to Redis queue: ${error.message}`);
    }
  }

  private async removeFromRedisQueue(counselorId: string): Promise<void> {
    try {
      await this.redisService.srem(QUEUE_CACHE_KEY, counselorId);
    } catch (error) {
      this.logger.warn(`Failed to remove from Redis queue: ${error.message}`);
    }
  }

  private async getRedisQueueMembers(): Promise<string[]> {
    try {
      return await this.redisService.smembers(QUEUE_CACHE_KEY);
    } catch (error) {
      this.logger.warn(`Failed to get Redis queue: ${error.message}`);
      // Fallback to database
      const entries = await this.queueRepository.find({
        where: { status: QueueStatus.WAITING },
        select: ['counselorId'],
      });
      return entries.map(e => e.counselorId);
    }
  }

  /**
   * Cleanup stale queue entries (called periodically)
   */
  async cleanupStaleEntries(): Promise<void> {
    const staleTime = new Date(Date.now() - QUEUE_TTL * 1000);
    
    await this.queueRepository
      .createQueryBuilder()
      .update(CounselorQueue)
      .set({ status: QueueStatus.LEFT })
      .where('status = :status', { status: QueueStatus.WAITING })
      .andWhere('joined_at < :staleTime', { staleTime })
      .execute();

    this.logger.log('Cleaned up stale queue entries');
  }

  /**
   * Mark session as completed for a counselor (called when session ends)
   * This updates the queue entry from MATCHED to COMPLETED/LEFT
   */
  async completeSessionForCounselor(counselorId: string, sessionId: string): Promise<void> {
    try {
      // Find the queue entry for this counselor and session
      const queueEntry = await this.queueRepository.findOne({
        where: { 
          counselorId, 
          matchedSessionId: sessionId,
          status: QueueStatus.MATCHED 
        },
      });

      if (queueEntry) {
        // Update to LEFT status (session completed)
        queueEntry.status = QueueStatus.LEFT;
        await this.queueRepository.save(queueEntry);
        
        this.logger.log(`Counselor ${counselorId} session ${sessionId} marked as completed`);
        
        // Emit event for any listeners
        this.eventEmitter.emit('counselor.session.completed', { 
          counselorId, 
          sessionId 
        });
      }
    } catch (error) {
      this.logger.error(`Failed to complete session for counselor: ${error.message}`);
    }
  }

  /**
   * Mark session as completed by session ID (for when we don't know the counselor)
   */
  async completeSessionBySessionId(sessionId: string): Promise<void> {
    try {
      const queueEntry = await this.queueRepository.findOne({
        where: { 
          matchedSessionId: sessionId,
          status: QueueStatus.MATCHED 
        },
      });

      if (queueEntry) {
        queueEntry.status = QueueStatus.LEFT;
        await this.queueRepository.save(queueEntry);
        
        this.logger.log(`Session ${sessionId} queue entry marked as completed`);
      }
    } catch (error) {
      this.logger.error(`Failed to complete session by ID: ${error.message}`);
    }
  }
}
