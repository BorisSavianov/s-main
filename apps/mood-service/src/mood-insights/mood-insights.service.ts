// apps/mood-service/src/mood-insights/mood-insights.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MoodInsight } from '../database/entities/mood-insight.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateMoodInsightDto,
  MoodInsightSearchDto,
  MoodInsightResponseDto,
} from './dto/mood-insights.dto';

@Injectable()
export class MoodInsightsService {
  private readonly logger = new Logger(MoodInsightsService.name);

  constructor(
    @InjectRepository(MoodInsight)
    private readonly moodInsightRepository: Repository<MoodInsight>,
    private readonly redisService: RedisService,
  ) {}

  async createMoodInsight(
    userId: string,
    createMoodInsightDto: CreateMoodInsightDto,
  ): Promise<MoodInsightResponseDto> {
    const moodInsight = this.moodInsightRepository.create({
      ...createMoodInsightDto,
      userId,
    });

    const savedInsight = await this.moodInsightRepository.save(moodInsight);

    // Invalidate cache
    await this.redisService.del(`mood:insights:${userId}`);

    this.logger.log(`Mood insight created for user: ${userId}`);

    return this.transformToMoodInsightResponse(savedInsight);
  }

  async getMoodInsights(
    userId: string,
    searchDto: MoodInsightSearchDto,
  ): Promise<any> {
    const { page = 1, limit = 10, insightType, isRead } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.moodInsightRepository
      .createQueryBuilder('insight')
      .where('insight.userId = :userId', { userId });

    if (insightType) {
      queryBuilder.andWhere('insight.insightType = :insightType', {
        insightType,
      });
    }

    if (typeof isRead === 'boolean') {
      queryBuilder.andWhere('insight.isRead = :isRead', { isRead });
    }

    queryBuilder.skip(skip).take(limit).orderBy('insight.createdAt', 'DESC');

    const [insights, total] = await queryBuilder.getManyAndCount();

    const transformedInsights = insights.map((insight) =>
      this.transformToMoodInsightResponse(insight),
    );

    return {
      insights: transformedInsights,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMoodInsightById(
    userId: string,
    insightId: string,
  ): Promise<MoodInsightResponseDto> {
    const insight = await this.moodInsightRepository.findOne({
      where: { id: insightId, userId },
    });

    if (!insight) {
      throw new NotFoundException('Mood insight not found');
    }

    return this.transformToMoodInsightResponse(insight);
  }

  async markAsRead(userId: string, insightId: string): Promise<void> {
    const insight = await this.moodInsightRepository.findOne({
      where: { id: insightId, userId },
    });

    if (!insight) {
      throw new NotFoundException('Mood insight not found');
    }

    await this.moodInsightRepository.update(insightId, { isRead: true });

    // Invalidate cache
    await this.redisService.del(`mood:insights:${userId}`);

    this.logger.log(
      `Mood insight marked as read: ${insightId} for user: ${userId}`,
    );
  }

  async markAsHelpful(
    userId: string,
    insightId: string,
    isHelpful: boolean,
  ): Promise<void> {
    const insight = await this.moodInsightRepository.findOne({
      where: { id: insightId, userId },
    });

    if (!insight) {
      throw new NotFoundException('Mood insight not found');
    }

    await this.moodInsightRepository.update(insightId, { isHelpful });

    this.logger.log(
      `Mood insight feedback updated: ${insightId} for user: ${userId}`,
    );
  }

  async deleteMoodInsight(userId: string, insightId: string): Promise<void> {
    const insight = await this.moodInsightRepository.findOne({
      where: { id: insightId, userId },
    });

    if (!insight) {
      throw new NotFoundException('Mood insight not found');
    }

    await this.moodInsightRepository.remove(insight);

    // Invalidate cache
    await this.redisService.del(`mood:insights:${userId}`);

    this.logger.log(`Mood insight deleted: ${insightId} for user: ${userId}`);
  }

  private transformToMoodInsightResponse(
    insight: MoodInsight,
  ): MoodInsightResponseDto {
    return {
      id: insight.id,
      userId: insight.userId,
      insightType: insight.insightType,
      insightText: insight.insightText,
      confidenceScore: insight.confidenceScore
        ? parseFloat(insight.confidenceScore.toString())
        : undefined,
      dataPoints: insight.dataPoints,
      isRead: insight.isRead,
      isHelpful: insight.isHelpful,
      createdAt: insight.createdAt.toISOString(),
      updatedAt: insight.updatedAt.toISOString(),
    };
  }
}
