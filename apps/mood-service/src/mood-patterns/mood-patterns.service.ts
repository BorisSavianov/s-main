// apps/mood-service/src/mood-patterns/mood-patterns.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';

import {
  MoodPattern,
  TrendDirection,
} from '../database/entities/mood-pattern.entity';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { MoodInsight } from '../database/entities/mood-insight.entity';
import { MoodGoal } from '../database/entities/mood-goal.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateMoodPatternDto,
  MoodPatternSearchDto,
  MoodPatternResponseDto,
  PatternAnalysisDto,
  PaginatedMoodPatternsResponseDto,
  WeeklyPatternDto,
  MonthlyPatternDto,
  HourlyPatternDto,
  CorrelationDto,
} from './dto/mood-patterns.dto';

import { MoodAiService } from '../mood-ai/mood-ai.service';

@Injectable()
export class MoodPatternsService {
  private readonly logger = new Logger(MoodPatternsService.name);

  constructor(
    @InjectRepository(MoodPattern)
    private readonly moodPatternRepository: Repository<MoodPattern>,
    @InjectRepository(MoodEntry)
    private readonly moodEntryRepository: Repository<MoodEntry>,
    @InjectRepository(MoodInsight)
    private readonly moodInsightRepository: Repository<MoodInsight>,
    @InjectRepository(MoodGoal)
    private readonly moodGoalRepository: Repository<MoodGoal>,
    private readonly redisService: RedisService,
    private readonly moodAiService: MoodAiService,
  ) {}

  async analyzeMoodPatterns(
    userId: string,
    days: number = 30,
  ): Promise<PatternAnalysisDto> {
    // Try to get from cache first
    const cacheKey = `mood:patterns:${userId}:${days}`;
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
      order: { entryDate: 'ASC' },
    });

    if (entries.length === 0) {
      throw new NotFoundException('No mood entries found for analysis');
    }

    const weeklyPattern = await this.calculateWeeklyPattern(entries);
    const monthlyPattern = await this.calculateMonthlyPattern(entries);
    const hourlyPattern = await this.calculateHourlyPattern(entries);
    const correlations = await this.calculateCorrelations(entries);
    const triggerCorrelations = await this.calculateTriggerCorrelations(entries);
    
    const allCorrelations = [...correlations, ...triggerCorrelations].sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
    );

    const insights = await this.generateAndSaveInsights(
      userId,
      entries,
      weeklyPattern,
      allCorrelations,
    );

    const analysis: PatternAnalysisDto = {
      weeklyPattern,
      monthlyPattern,
      hourlyPattern,
      correlations: allCorrelations,
      insights,
    };

    // Cache for 2 hours
    await this.redisService.set(cacheKey, JSON.stringify(analysis), 7200);

    return analysis;
  }

  async generateMoodPatterns(userId: string, days: number = 30): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const entries = await this.moodEntryRepository.find({
      where: {
        userId,
        entryDate: MoreThanOrEqual(startDate),
      },
      order: { entryDate: 'ASC' },
    });

    if (entries.length < 7) {
      this.logger.warn(
        `Insufficient data for pattern generation: ${entries.length} entries`,
      );
      return;
    }

    // Generate weekly patterns
    await this.generateWeeklyPatterns(userId, entries);

    // Generate monthly patterns
    await this.generateMonthlyPatterns(userId, entries);

    // Invalidate cache
    await this.redisService.del(`mood:patterns:${userId}:*`);

    this.logger.log(`Generated mood patterns for user: ${userId}`);
  }

  async getMoodPatterns(
    userId: string,
    searchDto: MoodPatternSearchDto,
  ): Promise<PaginatedMoodPatternsResponseDto> {
    const {
      page = 1,
      limit = 10,
      patternType,
      trendDirection,
      startDate,
      endDate,
    } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.moodPatternRepository
      .createQueryBuilder('pattern')
      .where('pattern.userId = :userId', { userId });

    if (patternType) {
      queryBuilder.andWhere('pattern.patternType = :patternType', {
        patternType,
      });
    }

    if (trendDirection) {
      queryBuilder.andWhere('pattern.trendDirection = :trendDirection', {
        trendDirection,
      });
    }

    if (startDate && endDate) {
      queryBuilder
        .andWhere('pattern.startDate >= :startDate', {
          startDate: new Date(startDate),
        })
        .andWhere('pattern.endDate <= :endDate', {
          endDate: new Date(endDate),
        });
    }

    queryBuilder.skip(skip).take(limit).orderBy('pattern.createdAt', 'DESC');

    const [patterns, total] = await queryBuilder.getManyAndCount();

    const transformedPatterns = patterns.map((pattern) =>
      this.transformToMoodPatternResponse(pattern),
    );

    return {
      patterns: transformedPatterns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMoodPatternById(
    userId: string,
    patternId: string,
  ): Promise<MoodPatternResponseDto> {
    const pattern = await this.moodPatternRepository.findOne({
      where: { id: patternId, userId },
    });

    if (!pattern) {
      throw new NotFoundException('Mood pattern not found');
    }

    return this.transformToMoodPatternResponse(pattern);
  }

  async deleteMoodPattern(userId: string, patternId: string): Promise<void> {
    const pattern = await this.moodPatternRepository.findOne({
      where: { id: patternId, userId },
    });

    if (!pattern) {
      throw new NotFoundException('Mood pattern not found');
    }

    await this.moodPatternRepository.remove(pattern);

    // Invalidate cache
    await this.redisService.del(`mood:patterns:${userId}:*`);

    this.logger.log(`Mood pattern deleted: ${patternId} for user: ${userId}`);
  }

  async getWeeklyPattern(
    userId: string,
    weeks: number = 4,
  ): Promise<WeeklyPatternDto> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);

    const entries = await this.moodEntryRepository.find({
      where: {
        userId,
        entryDate: MoreThanOrEqual(startDate),
      },
      order: { entryDate: 'ASC' },
    });

    return this.calculateWeeklyPattern(entries);
  }

  async getMonthlyPattern(
    userId: string,
    months: number = 3,
  ): Promise<MonthlyPatternDto> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const entries = await this.moodEntryRepository.find({
      where: {
        userId,
        entryDate: MoreThanOrEqual(startDate),
      },
      order: { entryDate: 'ASC' },
    });

    return this.calculateMonthlyPattern(entries);
  }

  async getMoodCorrelations(
    userId: string,
    days: number = 30,
  ): Promise<CorrelationDto[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const entries = await this.moodEntryRepository.find({
      where: {
        userId,
        entryDate: MoreThanOrEqual(startDate),
      },
    });

    return this.calculateCorrelations(entries);
  }

  private async calculateWeeklyPattern(
    entries: MoodEntry[],
  ): Promise<WeeklyPatternDto> {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayData: { [key: number]: { ratings: number[]; count: number } } = {};

    // Initialize day data
    for (let i = 0; i < 7; i++) {
      dayData[i] = { ratings: [], count: 0 };
    }

    // Group entries by day of week
    entries.forEach((entry) => {
      const dayOfWeek = (new Date(entry.entryDate).getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
      dayData[dayOfWeek].ratings.push(entry.rating);
      dayData[dayOfWeek].count++;
    });

    const averageRatings = days.map((_, index) => {
      const ratings = dayData[index].ratings;
      return ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;
    });

    const entryCounts = days.map((_, index) => dayData[index].count);

    // Calculate trend
    const firstHalf = averageRatings.slice(0, 3).filter((r) => r > 0);
    const secondHalf = averageRatings.slice(4, 7).filter((r) => r > 0);

    const trend = this.calculateTrend(firstHalf, secondHalf);

    return {
      days,
      averageRatings: averageRatings.map(
        (rating) => Math.round(rating * 100) / 100,
      ),
      entryCounts,
      trend,
    };
  }

  private async calculateMonthlyPattern(
    entries: MoodEntry[],
  ): Promise<MonthlyPatternDto> {
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const weekData: { [key: number]: { ratings: number[]; count: number } } =
      {};

    // Initialize week data
    for (let i = 0; i < 4; i++) {
      weekData[i] = { ratings: [], count: 0 };
    }

    // Group entries by week of month
    entries.forEach((entry) => {
      const weekOfMonth = Math.floor(
        (new Date(entry.entryDate).getDate() - 1) / 7,
      );
      const week = Math.min(weekOfMonth, 3); // Cap at week 3 (0-indexed)
      weekData[week].ratings.push(entry.rating);
      weekData[week].count++;
    });

    const averageRatings = weeks.map((_, index) => {
      const ratings = weekData[index].ratings;
      return ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;
    });

    const entryCounts = weeks.map((_, index) => weekData[index].count);

    // Calculate trend
    const firstHalf = averageRatings.slice(0, 2).filter((r) => r > 0);
    const secondHalf = averageRatings.slice(2, 4).filter((r) => r > 0);

    const trend = this.calculateTrend(firstHalf, secondHalf);

    return {
      weeks,
      averageRatings: averageRatings.map(
        (rating) => Math.round(rating * 100) / 100,
      ),
      entryCounts,
      trend,
    };
  }

  private async calculateHourlyPattern(
    entries: MoodEntry[],
  ): Promise<HourlyPatternDto> {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourData: { [key: number]: { ratings: number[]; count: number } } =
      {};

    // Initialize hour data
    for (let i = 0; i < 24; i++) {
      hourData[i] = { ratings: [], count: 0 };
    }

    // Group entries by hour of creation (using createdAt since entryDate is date only)
    entries.forEach((entry) => {
      const hour = new Date(entry.createdAt).getHours();
      hourData[hour].ratings.push(entry.rating);
      hourData[hour].count++;
    });

    const averageRatings = hours.map((hour) => {
      const ratings = hourData[hour].ratings;
      return ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;
    });

    const entryCounts = hours.map((hour) => hourData[hour].count);

    // Calculate time of day averages
    const timeOfDayAverages = {
      morning: this.getTimeRangeAverage(averageRatings, 6, 11), // 6 AM - 11 AM
      afternoon: this.getTimeRangeAverage(averageRatings, 12, 17), // 12 PM - 5 PM
      evening: this.getTimeRangeAverage(averageRatings, 18, 23), // 6 PM - 11 PM
      night: this.getTimeRangeAverage(averageRatings, 0, 5), // 12 AM - 5 AM
    };

    return {
      hours,
      averageRatings: averageRatings.map(
        (rating) => Math.round(rating * 100) / 100,
      ),
      entryCounts,
      timeOfDayAverages,
    };
  }

  private getTimeRangeAverage(
    ratings: number[],
    start: number,
    end: number,
  ): number {
    const rangeRatings = ratings.slice(start, end + 1).filter((r) => r > 0);
    return rangeRatings.length > 0
      ? Math.round(
          (rangeRatings.reduce((sum, rating) => sum + rating, 0) /
            rangeRatings.length) *
            100,
        ) / 100
      : 0;
  }

  private async calculateCorrelations(
    entries: MoodEntry[],
  ): Promise<CorrelationDto[]> {
    const correlations: CorrelationDto[] = [];

    // Sleep hours correlation
    const sleepEntries = entries.filter(
      (e) => e.sleepHours !== null && e.sleepHours !== undefined,
    );
    if (sleepEntries.length > 5) {
      const sleepCorr = this.calculatePearsonCorrelation(
        sleepEntries.map((e) => e.rating),
        sleepEntries.map((e) => parseFloat(e.sleepHours!.toString())),
      );
      correlations.push({
        factor: 'sleep_hours',
        correlation: Math.round(sleepCorr * 100) / 100,
        strength: this.getCorrelationStrength(sleepCorr),
        description: this.getCorrelationDescription('Sleep hours', sleepCorr),
      });
    }

    // Exercise correlation
    const exerciseEntries = entries.filter(
      (e) => e.exerciseMinutes !== null && e.exerciseMinutes !== undefined,
    );
    if (exerciseEntries.length > 5) {
      const exerciseCorr = this.calculatePearsonCorrelation(
        exerciseEntries.map((e) => e.rating),
        exerciseEntries.map((e) => e.exerciseMinutes!),
      );
      correlations.push({
        factor: 'exercise_minutes',
        correlation: Math.round(exerciseCorr * 100) / 100,
        strength: this.getCorrelationStrength(exerciseCorr),
        description: this.getCorrelationDescription('Exercise', exerciseCorr),
      });
    }

    // Stress level correlation
    const stressEntries = entries.filter(
      (e) => e.stressLevel !== null && e.stressLevel !== undefined,
    );
    if (stressEntries.length > 5) {
      const stressCorr = this.calculatePearsonCorrelation(
        stressEntries.map((e) => e.rating),
        stressEntries.map((e) => e.stressLevel!),
      );
      correlations.push({
        factor: 'stress_level',
        correlation: Math.round(stressCorr * 100) / 100,
        strength: this.getCorrelationStrength(stressCorr),
        description: this.getCorrelationDescription('Stress level', stressCorr),
      });
    }

    // Energy level correlation
    const energyEntries = entries.filter(
      (e) => e.energyLevel !== null && e.energyLevel !== undefined,
    );
    if (energyEntries.length > 5) {
      const energyCorr = this.calculatePearsonCorrelation(
        energyEntries.map((e) => e.rating),
        energyEntries.map((e) => e.energyLevel!),
      );
      correlations.push({
        factor: 'energy_level',
        correlation: Math.round(energyCorr * 100) / 100,
        strength: this.getCorrelationStrength(energyCorr),
        description: this.getCorrelationDescription('Energy level', energyCorr),
      });
    }

    return correlations.sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
    );
  }

  private async calculateTriggerCorrelations(
    entries: MoodEntry[],
  ): Promise<CorrelationDto[]> {
    const correlations: CorrelationDto[] = [];
    const triggerMap = new Map<string, { ratings: number[]; count: number }>();

    // Collect ratings for each trigger
    entries.forEach((entry) => {
      if (entry.triggers && entry.triggers.length > 0) {
        entry.triggers.forEach((trigger) => {
          if (!triggerMap.has(trigger)) {
            triggerMap.set(trigger, { ratings: [], count: 0 });
          }
          const data = triggerMap.get(trigger)!;
          data.ratings.push(entry.rating);
          data.count++;
        });
      }
    });

    // Calculate correlation for each trigger
    // We'll use point-biserial correlation (binary variable: trigger present/absent)
    // But for simplicity and robustness with small data, we'll compare average mood with trigger vs overall average
    const overallAvg =
      entries.reduce((sum, e) => sum + e.rating, 0) / entries.length;

    for (const [trigger, data] of triggerMap.entries()) {
      if (data.count >= 3) {
        // Minimum 3 occurrences
        const triggerAvg =
          data.ratings.reduce((sum, r) => sum + r, 0) / data.count;
        const diff = triggerAvg - overallAvg;

        // Normalize diff to -1 to 1 range roughly (assuming 1-5 scale, max diff is 4)
        const correlation = Math.max(Math.min(diff / 2, 1), -1);

        correlations.push({
          factor: trigger,
          correlation: Math.round(correlation * 100) / 100,
          strength: this.getCorrelationStrength(correlation),
          description: `Mood is ${
            diff > 0 ? 'higher' : 'lower'
          } when '${trigger}' is present`,
        });
      }
    }

    return correlations.sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
    );
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private getCorrelationStrength(correlation: number): string {
    const abs = Math.abs(correlation);
    if (abs >= 0.7)
      return correlation > 0 ? 'strong_positive' : 'strong_negative';
    if (abs >= 0.5)
      return correlation > 0 ? 'moderate_positive' : 'moderate_negative';
    if (abs >= 0.3) return correlation > 0 ? 'weak_positive' : 'weak_negative';
    return 'no_correlation';
  }

  private getCorrelationDescription(
    factor: string,
    correlation: number,
  ): string {
    const strength = this.getCorrelationStrength(correlation);
    const direction = correlation > 0 ? 'positive' : 'negative';
    return `${factor} shows ${strength.replace('_', ' ')} correlation with mood ratings`;
  }

  private calculateTrend(
    firstHalf: number[],
    secondHalf: number[],
  ): TrendDirection {
    if (firstHalf.length === 0 || secondHalf.length === 0)
      return TrendDirection.STABLE;

    const firstAvg =
      firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;

    if (diff > 0.2) return TrendDirection.IMPROVING;
    if (diff < -0.2) return TrendDirection.DECLINING;
    return TrendDirection.STABLE;
  }

  private async generateAndSaveInsights(
    userId: string,
    entries: MoodEntry[],
    weeklyPattern: WeeklyPatternDto,
    correlations: CorrelationDto[],
  ): Promise<string[]> {
    const insights: string[] = [];
    const newInsightsToSave: {
      text: string;
      category: string;
      recommendation?: string;
      relatedEntityId?: string;
    }[] = [];

    // Weekly pattern insights
    const bestDay =
      weeklyPattern.days[
        weeklyPattern.averageRatings.indexOf(
          Math.max(...weeklyPattern.averageRatings),
        )
      ];
    const worstDay =
      weeklyPattern.days[
        weeklyPattern.averageRatings.indexOf(
          Math.min(...weeklyPattern.averageRatings.filter((r) => r > 0)),
        )
      ];

    if (bestDay && worstDay) {
      const text = `Your mood tends to be highest on ${bestDay} and lowest on ${worstDay}`;
      insights.push(text);
      newInsightsToSave.push({
        text,
        category: 'PATTERN',
        recommendation: `Plan your most challenging tasks for ${bestDay} when you feel best.`,
      });
    }

    // Correlation insights
    const strongCorrelations = correlations.filter(
      (c) => Math.abs(c.correlation) >= 0.5,
    );
    strongCorrelations.forEach((corr) => {
      insights.push(corr.description);
      newInsightsToSave.push({
        text: corr.description,
        category: 'CORRELATION',
        recommendation: this.getRecommendationForCorrelation(corr),
      });
    });

    // Trend insights
    if (weeklyPattern.trend === TrendDirection.IMPROVING) {
      const text = 'Your mood shows an improving trend throughout the week';
      insights.push(text);
      newInsightsToSave.push({
        text,
        category: 'PATTERN',
        recommendation: 'Keep doing what you are doing! Your routine is working.',
      });
    } else if (weeklyPattern.trend === TrendDirection.DECLINING) {
      const text = 'Your mood tends to decline as the week progresses';
      insights.push(text);
      newInsightsToSave.push({
        text,
        category: 'PATTERN',
        recommendation: 'Try to schedule some self-care activities for the end of the week.',
      });
    }

    // Achievement insights (Streaks)
    const goals = await this.moodGoalRepository.find({
      where: { userId, isActive: true },
    });

    goals.forEach((goal) => {
      if (goal.currentStreak >= 3) {
        const text = `You're on a ${goal.currentStreak}-day streak for your '${goal.goalType.replace(
          '_',
          ' ',
        )}' goal!`;
        insights.push(text);
        newInsightsToSave.push({
          text,
          category: 'ACHIEVEMENT',
          recommendation: 'Keep up the momentum! Consistency is key.',
          relatedEntityId: goal.id,
        });
      }
    });

    // AI-Driven Deep Analysis
    try {
      if (entries.length >= 5) {
        this.logger.log('Generating AI-driven insights...');
        const aiAnalysis = await this.moodAiService.generateDeepAnalysis(
          userId,
          entries,
        );

        // Add AI insights
        aiAnalysis.insights.forEach((insight) => {
          insights.push(insight);
          newInsightsToSave.push({
            text: insight,
            category: 'AI_DEEP_DIVE',
            recommendation: undefined,
          });
        });

        // Add AI patterns
        aiAnalysis.patterns.forEach((pattern) => {
          insights.push(pattern);
          newInsightsToSave.push({
            text: pattern,
            category: 'AI_PATTERN',
            recommendation: undefined,
          });
        });

        // Add AI recommendations
        aiAnalysis.recommendations.forEach((rec) => {
          newInsightsToSave.push({
            text: 'AI Recommendation',
            category: 'AI_RECOMMENDATION',
            recommendation: rec,
          });
        });

        this.logger.log(
          `Generated ${aiAnalysis.insights.length} AI insights, ${aiAnalysis.patterns.length} patterns, ${aiAnalysis.recommendations.length} recommendations`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate AI insights: ${error.message}`,
        error.stack,
      );
      // Continue without AI insights if it fails
    }

    // Save all insights to database
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of newInsightsToSave) {
      const existing = await this.moodInsightRepository.findOne({
        where: {
          userId,
          insightText: item.text,
          createdAt: MoreThanOrEqual(today),
        },
      });

      if (!existing) {
        await this.moodInsightRepository.save({
          userId,
          insightType: 'automated_analysis',
          insightText: item.text,
          category: item.category,
          recommendation: item.recommendation,
          relatedEntityId: (item as any).relatedEntityId,
          isRead: false,
          confidenceScore: 0.85,
        });
      }
    }

    return insights;
  }

  private getRecommendationForCorrelation(corr: CorrelationDto): string {
    if (corr.factor === 'sleep_hours') {
      return corr.correlation > 0
        ? 'Prioritize getting 7-8 hours of sleep to maintain positive mood.'
        : 'Check if oversleeping is making you feel groggy.';
    }
    if (corr.factor === 'exercise_minutes') {
      return 'Regular exercise seems to boost your mood. Try to move for at least 30 mins daily.';
    }
    if (corr.factor === 'stress_level') {
      return 'High stress impacts your mood. Consider mindfulness or breaks during work.';
    }
    return `Pay attention to how ${corr.factor} affects your well-being.`;
  }

  private async generateWeeklyPatterns(
    userId: string,
    entries: MoodEntry[],
  ): Promise<void> {
    // Group entries by week
    const weekGroups: { [key: string]: MoodEntry[] } = {};

    entries.forEach((entry) => {
      const weekStart = this.getWeekStart(new Date(entry.entryDate));
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = [];
      }
      weekGroups[weekKey].push(entry);
    });

    // Create patterns for each week with sufficient data
    for (const [weekKey, weekEntries] of Object.entries(weekGroups)) {
      if (weekEntries.length >= 3) {
        // Minimum 3 entries per week
        const weekStart = new Date(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const weeklyPattern = await this.calculateWeeklyPattern(weekEntries);

        const patternData = {
          days: weeklyPattern.days,
          averageRatings: weeklyPattern.averageRatings,
          entryCounts: weeklyPattern.entryCounts,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
        };

        const avgRating =
          weekEntries.reduce((sum, entry) => sum + entry.rating, 0) /
          weekEntries.length;

        const pattern = this.moodPatternRepository.create({
          userId,
          patternType: 'weekly',
          patternData,
          averageRating: Math.round(avgRating * 100) / 100,
          trendDirection: weeklyPattern.trend,
          confidenceScore: Math.min(weekEntries.length / 7, 1),
          startDate: weekStart,
          endDate: weekEnd,
        });

        await this.moodPatternRepository.save(pattern);
      }
    }
  }

  private async generateMonthlyPatterns(
    userId: string,
    entries: MoodEntry[],
  ): Promise<void> {
    // Group entries by month
    const monthGroups: { [key: string]: MoodEntry[] } = {};

    entries.forEach((entry) => {
      const monthKey = `${new Date(entry.entryDate).getFullYear()}-${String(new Date(entry.entryDate).getMonth() + 1).padStart(2, '0')}`;

      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = [];
      }
      monthGroups[monthKey].push(entry);
    });

    // Create patterns for each month with sufficient data
    for (const [monthKey, monthEntries] of Object.entries(monthGroups)) {
      if (monthEntries.length >= 10) {
        // Minimum 10 entries per month
        const [year, month] = monthKey.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);

        const monthlyPattern = await this.calculateMonthlyPattern(monthEntries);

        const patternData = {
          weeks: monthlyPattern.weeks,
          averageRatings: monthlyPattern.averageRatings,
          entryCounts: monthlyPattern.entryCounts,
          monthStart: monthStart.toISOString(),
          monthEnd: monthEnd.toISOString(),
        };

        const avgRating =
          monthEntries.reduce((sum, entry) => sum + entry.rating, 0) /
          monthEntries.length;

        const pattern = this.moodPatternRepository.create({
          userId,
          patternType: 'monthly',
          patternData,
          averageRating: Math.round(avgRating * 100) / 100,
          trendDirection: monthlyPattern.trend,
          confidenceScore: Math.min(monthEntries.length / 30, 1),
          startDate: monthStart,
          endDate: monthEnd,
        });

        await this.moodPatternRepository.save(pattern);
      }
    }
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  }

  private transformToMoodPatternResponse(
    pattern: MoodPattern,
  ): MoodPatternResponseDto {
    return {
      id: pattern.id,
      userId: pattern.userId,
      patternType: pattern.patternType,
      patternData: pattern.patternData,
      averageRating: pattern.averageRating,
      trendDirection: pattern.trendDirection,
      confidenceScore: pattern.confidenceScore,
      startDate: pattern.startDate.toISOString().split('T')[0],
      endDate: pattern.endDate.toISOString().split('T')[0],
      createdAt: pattern.createdAt.toISOString(),
      updatedAt: pattern.updatedAt.toISOString(),
    };
  }
}
