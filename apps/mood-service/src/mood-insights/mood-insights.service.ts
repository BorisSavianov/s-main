// apps/mood-service/src/mood-insights/mood-insights.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MoodInsight } from '../database/entities/mood-insight.entity';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { RedisService } from '../redis/redis.service';
import { MoodAiService } from '../mood-ai/mood-ai.service';
import { MoreThanOrEqual } from 'typeorm';

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
    @InjectRepository(MoodEntry)
    private readonly moodEntryRepository: Repository<MoodEntry>,
    private readonly redisService: RedisService,
    private readonly moodAiService: MoodAiService,
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

  /**
   * Generate AI-driven insights for a user
   * This replaces rule-based insights with personalized AI analysis
   */
  async generateAiInsights(userId: string, days: number = 14): Promise<{
    generated: number;
    insights: MoodInsightResponseDto[];
  }> {
    try {
      // Fetch recent mood entries
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const entries = await this.moodEntryRepository.find({
        where: {
          userId,
          entryDate: MoreThanOrEqual(startDate),
        },
        order: { entryDate: 'DESC' },
      });

      if (entries.length < 3) {
        this.logger.warn(
          `Insufficient data for AI insights (${entries.length} entries)`,
        );
        return { generated: 0, insights: [] };
      }

      // Generate AI analysis
      const aiAnalysis = await this.moodAiService.generateDeepAnalysis(
        userId,
        entries,
      );

      const newInsights: MoodInsightResponseDto[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Save AI insights
      for (const insight of aiAnalysis.insights) {
        const existing = await this.moodInsightRepository.findOne({
          where: {
            userId,
            insightText: insight,
            createdAt: MoreThanOrEqual(today),
          },
        });

        if (!existing) {
          const saved = await this.moodInsightRepository.save({
            userId,
            insightType: 'ai_generated',
            insightText: insight,
            category: 'AI_DEEP_DIVE',
            confidenceScore: 0.9,
            dataPoints: entries.length,
            isRead: false,
          });
          newInsights.push(this.transformToMoodInsightResponse(saved));
        }
      }

      // Save AI patterns
      for (const pattern of aiAnalysis.patterns) {
        const existing = await this.moodInsightRepository.findOne({
          where: {
            userId,
            insightText: pattern,
            createdAt: MoreThanOrEqual(today),
          },
        });

        if (!existing) {
          const saved = await this.moodInsightRepository.save({
            userId,
            insightType: 'ai_generated',
            insightText: pattern,
            category: 'AI_PATTERN',
            confidenceScore: 0.85,
            dataPoints: entries.length,
            isRead: false,
          });
          newInsights.push(this.transformToMoodInsightResponse(saved));
        }
      }

      // Save AI recommendations
      for (const rec of aiAnalysis.recommendations) {
        const existing = await this.moodInsightRepository.findOne({
          where: {
            userId,
            recommendation: rec,
            createdAt: MoreThanOrEqual(today),
          },
        });

        if (!existing) {
          const saved = await this.moodInsightRepository.save({
            userId,
            insightType: 'ai_generated',
            insightText: 'AI Recommendation',
            category: 'AI_RECOMMENDATION',
            recommendation: rec,
            confidenceScore: 0.88,
            dataPoints: entries.length,
            isRead: false,
          });
          newInsights.push(this.transformToMoodInsightResponse(saved));
        }
      }

      // Invalidate cache
      await this.redisService.del(`mood:insights:${userId}`);

      this.logger.log(
        `Generated ${newInsights.length} AI insights for user: ${userId}`,
      );

      return {
        generated: newInsights.length,
        insights: newInsights,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate AI insights: ${error.message}`,
        error.stack,
      );
      throw error;
    }
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
      recommendation: insight.recommendation,
      category: insight.category,
      relatedEntityId: insight.relatedEntityId,
    };
  }
}
