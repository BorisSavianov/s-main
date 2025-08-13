// apps/mood-service/src/mood-entries/mood-entries.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';

import { MoodEntry } from '../database/entities/mood-entry.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateMoodEntryDto,
  UpdateMoodEntryDto,
  MoodEntrySearchDto,
  MoodEntryResponseDto,
  PaginatedMoodEntriesResponseDto,
  MoodStatsDto,
} from './dto/mood-entries.dto';

@Injectable()
export class MoodEntriesService {
  private readonly logger = new Logger(MoodEntriesService.name);

  constructor(
    @InjectRepository(MoodEntry)
    private readonly moodEntryRepository: Repository<MoodEntry>,
    private readonly redisService: RedisService,
  ) {}

  async createMoodEntry(
    userId: string,
    createMoodEntryDto: CreateMoodEntryDto,
  ): Promise<MoodEntryResponseDto> {
    const { entryDate, ...entryData } = createMoodEntryDto;

    // Check if entry already exists for this date
    const existingEntry = await this.moodEntryRepository.findOne({
      where: {
        userId,
        entryDate: new Date(entryDate),
      },
    });

    if (existingEntry) {
      throw new ConflictException('Mood entry already exists for this date');
    }

    const moodEntry = this.moodEntryRepository.create({
      ...entryData,
      userId,
      entryDate: new Date(entryDate),
    });

    const savedEntry = await this.moodEntryRepository.save(moodEntry);

    // Invalidate user mood cache
    await this.redisService.del(`mood:${userId}:*`);
    await this.redisService.del(`mood:stats:${userId}`);

    this.logger.log(`Mood entry created for user: ${userId} on ${entryDate}`);

    return this.transformToMoodEntryResponse(savedEntry);
  }

  async getMoodEntries(
    userId: string,
    searchDto: MoodEntrySearchDto,
  ): Promise<PaginatedMoodEntriesResponseDto> {
    const {
      page = 1,
      limit = 30,
      startDate,
      endDate,
      minRating,
      maxRating,
      moodRating,
    } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.moodEntryRepository
      .createQueryBuilder('entry')
      .where('entry.userId = :userId', { userId });

    // Apply date filters
    if (startDate && endDate) {
      queryBuilder.andWhere('entry.entryDate BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    } else if (startDate) {
      queryBuilder.andWhere('entry.entryDate >= :startDate', {
        startDate: new Date(startDate),
      });
    } else if (endDate) {
      queryBuilder.andWhere('entry.entryDate <= :endDate', {
        endDate: new Date(endDate),
      });
    }

    // Apply rating filters
    if (minRating !== undefined) {
      queryBuilder.andWhere('entry.rating >= :minRating', { minRating });
    }

    if (maxRating !== undefined) {
      queryBuilder.andWhere('entry.rating <= :maxRating', { maxRating });
    }

    if (moodRating) {
      queryBuilder.andWhere('entry.moodRating = :moodRating', { moodRating });
    }

    // Apply pagination and ordering
    queryBuilder.skip(skip).take(limit).orderBy('entry.entryDate', 'DESC');

    const [entries, total] = await queryBuilder.getManyAndCount();

    const transformedEntries = entries.map((entry) =>
      this.transformToMoodEntryResponse(entry),
    );

    return {
      entries: transformedEntries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMoodEntryById(
    userId: string,
    entryId: string,
  ): Promise<MoodEntryResponseDto> {
    const entry = await this.moodEntryRepository.findOne({
      where: { id: entryId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Mood entry not found');
    }

    return this.transformToMoodEntryResponse(entry);
  }

  async getMoodEntryByDate(
    userId: string,
    date: string,
  ): Promise<MoodEntryResponseDto> {
    const entry = await this.moodEntryRepository.findOne({
      where: {
        userId,
        entryDate: new Date(date),
      },
    });

    if (!entry) {
      throw new NotFoundException('Mood entry not found for this date');
    }

    return this.transformToMoodEntryResponse(entry);
  }

  async updateMoodEntry(
    userId: string,
    entryId: string,
    updateMoodEntryDto: UpdateMoodEntryDto,
  ): Promise<MoodEntryResponseDto> {
    const entry = await this.moodEntryRepository.findOne({
      where: { id: entryId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Mood entry not found');
    }

    Object.assign(entry, updateMoodEntryDto);
    const updatedEntry = await this.moodEntryRepository.save(entry);

    // Invalidate cache
    await this.redisService.del(`mood:${userId}:*`);
    await this.redisService.del(`mood:stats:${userId}`);

    this.logger.log(`Mood entry updated: ${entryId} for user: ${userId}`);

    return this.transformToMoodEntryResponse(updatedEntry);
  }

  async deleteMoodEntry(userId: string, entryId: string): Promise<void> {
    const entry = await this.moodEntryRepository.findOne({
      where: { id: entryId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Mood entry not found');
    }

    await this.moodEntryRepository.remove(entry);

    // Invalidate cache
    await this.redisService.del(`mood:${userId}:*`);
    await this.redisService.del(`mood:stats:${userId}`);

    this.logger.log(`Mood entry deleted: ${entryId} for user: ${userId}`);
  }

  async getMoodStats(userId: string, days: number = 30): Promise<MoodStatsDto> {
    // Try to get from cache first
    const cacheKey = `mood:stats:${userId}:${days}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const entries = await this.moodEntryRepository.find({
      where: {
        userId,
        entryDate: MoreThanOrEqual(startDate),
      },
      order: { entryDate: 'DESC' },
    });

    if (entries.length === 0) {
      return {
        averageRating: 0,
        totalEntries: 0,
        streakDays: 0,
        moodDistribution: {},
        topTriggers: [],
        topActivities: [],
      };
    }

    // Calculate average rating
    const averageRating =
      entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length;

    // Calculate mood distribution
    const moodDistribution = entries.reduce(
      (dist, entry) => {
        const mood = entry.moodRating;
        dist[mood] = (dist[mood] || 0) + 1;
        return dist;
      },
      {} as Record<string, number>,
    );

    // Calculate current streak
    const streakDays = this.calculateStreak(entries);

    // Get top triggers and activities
    const allTriggers = entries.flatMap((entry) => entry.triggers || []);
    const allActivities = entries.flatMap((entry) => entry.activities || []);

    const triggerCounts = this.getTopItems(allTriggers);
    const activityCounts = this.getTopItems(allActivities);

    const stats: MoodStatsDto = {
      averageRating: Math.round(averageRating * 100) / 100,
      totalEntries: entries.length,
      streakDays,
      moodDistribution,
      topTriggers: triggerCounts.slice(0, 5),
      topActivities: activityCounts.slice(0, 5),
    };

    // Cache for 1 hour
    await this.redisService.set(cacheKey, JSON.stringify(stats), 3600);

    return stats;
  }

  private calculateStreak(entries: MoodEntry[]): number {
    if (entries.length === 0) return 0;

    // Sort entries by date (most recent first)
    const sortedEntries = entries.sort(
      (a, b) => b.entryDate.getTime() - a.entryDate.getTime(),
    );

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const entry of sortedEntries) {
      const entryDate = new Date(entry.entryDate);
      entryDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === streak) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  private getTopItems(items: string[]): string[] {
    const counts = items.reduce(
      (acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([item]) => item);
  }

  private transformToMoodEntryResponse(entry: MoodEntry): MoodEntryResponseDto {
    return {
      id: entry.id,
      userId: entry.userId,
      rating: entry.rating,
      moodRating: entry.moodRating,
      notes: entry.notes,
      energyLevel: entry.energyLevel,
      stressLevel: entry.stressLevel,
      sleepHours: entry.sleepHours
        ? parseFloat(entry.sleepHours.toString())
        : undefined,
      exerciseMinutes: entry.exerciseMinutes,
      medicationTaken: entry.medicationTaken,
      triggers: entry.triggers || [],
      activities: entry.activities || [],
      entryDate: entry.entryDate.toISOString().split('T')[0],
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
