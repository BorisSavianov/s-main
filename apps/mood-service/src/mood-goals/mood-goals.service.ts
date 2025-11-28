
// apps/mood-service/src/mood-goals/mood-goals.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';

import { MoodGoal } from '../database/entities/mood-goal.entity';
import { MoodEntry } from '../database/entities/mood-entry.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateMoodGoalDto,
  UpdateMoodGoalDto,
  MoodGoalSearchDto,
  MoodGoalResponseDto,
} from './dto/mood-goals.dto';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class MoodGoalsService {
  private readonly logger = new Logger(MoodGoalsService.name);

  constructor(
    @InjectRepository(MoodGoal)
    private readonly moodGoalRepository: Repository<MoodGoal>,
    @InjectRepository(MoodEntry)
    private readonly moodEntryRepository: Repository<MoodEntry>,
    private readonly redisService: RedisService,
  ) {}

  async createMoodGoal(
    userId: string,
    createMoodGoalDto: CreateMoodGoalDto,
  ): Promise<MoodGoalResponseDto> {
    const { targetDate, ...goalData } = createMoodGoalDto;

    // Validate target value based on goal type
    this.validateGoalTarget(createMoodGoalDto.goalType, createMoodGoalDto.targetValue);

    const moodGoal = this.moodGoalRepository.create({
      ...goalData,
      userId,
      targetDate: targetDate ? new Date(targetDate) : undefined,
    });

    const savedGoal = await this.moodGoalRepository.save(moodGoal);

    // Invalidate cache
    await this.redisService.del(`mood:goals:${userId}`);

    this.logger.log(`Mood goal created for user: ${userId}`);

    return this.transformToMoodGoalResponse(savedGoal);
  }

  async getMoodGoals(
    userId: string,
    searchDto: MoodGoalSearchDto,
  ): Promise<any> {
    const { page = 1, limit = 10, goalType, isActive, isAchieved } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.moodGoalRepository
      .createQueryBuilder('goal')
      .where('goal.userId = :userId', { userId });

    if (goalType) {
      queryBuilder.andWhere('goal.goalType = :goalType', { goalType });
    }

    if (typeof isActive === 'boolean') {
      queryBuilder.andWhere('goal.isActive = :isActive', { isActive });
    }

    if (typeof isAchieved === 'boolean') {
      queryBuilder.andWhere('goal.isAchieved = :isAchieved', { isAchieved });
    }

    queryBuilder.skip(skip).take(limit).orderBy('goal.createdAt', 'DESC');

    const [goals, total] = await queryBuilder.getManyAndCount();

    const transformedGoals = goals.map((goal) =>
      this.transformToMoodGoalResponse(goal),
    );

    return {
      goals: transformedGoals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMoodGoalById(
    userId: string,
    goalId: string,
  ): Promise<MoodGoalResponseDto> {
    const goal = await this.moodGoalRepository.findOne({
      where: { id: goalId, userId },
    });

    if (!goal) {
      throw new NotFoundException('Mood goal not found');
    }

    return this.transformToMoodGoalResponse(goal);
  }

  async updateMoodGoal(
    userId: string,
    goalId: string,
    updateMoodGoalDto: UpdateMoodGoalDto,
  ): Promise<MoodGoalResponseDto> {
    const goal = await this.moodGoalRepository.findOne({
      where: { id: goalId, userId },
    });

    if (!goal) {
      throw new NotFoundException('Mood goal not found');
    }

    const { targetDate, ...updateData } = updateMoodGoalDto;

    Object.assign(goal, updateData);
    if (updateMoodGoalDto.targetValue !== undefined) {
      // If goal type is not changing (which it isn't in update DTO), use existing goal type
      this.validateGoalTarget(goal.goalType, updateMoodGoalDto.targetValue);
      goal.targetValue = updateMoodGoalDto.targetValue;
    }
    if (targetDate) {
      goal.targetDate = new Date(targetDate);
    }

    const updatedGoal = await this.moodGoalRepository.save(goal);

    // Invalidate cache
    await this.redisService.del(`mood:goals:${userId}`);

    this.logger.log(`Mood goal updated: ${goalId} for user: ${userId}`);

    return this.transformToMoodGoalResponse(updatedGoal);
  }

  async deleteMoodGoal(userId: string, goalId: string): Promise<void> {
    const goal = await this.moodGoalRepository.findOne({
      where: { id: goalId, userId },
    });

    if (!goal) {
      throw new NotFoundException('Mood goal not found');
    }

    await this.moodGoalRepository.remove(goal);

    // Invalidate cache
    await this.redisService.del(`mood:goals:${userId}`);

    this.logger.log(`Mood goal deleted: ${goalId} for user: ${userId}`);
  }

  async checkGoalsProgress(userId: string): Promise<void> {
    try {
      const goals = await this.moodGoalRepository.find({
        where: { userId, isActive: true },
      });

      if (goals.length === 0) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get today's entry
      const todayEntry = await this.moodEntryRepository.findOne({
        where: {
          userId,
          entryDate: today.toISOString().split('T')[0] as any,
        },
      });

      if (!todayEntry) {
        this.logger.debug(`No entry for today, skipping goal progress check`);
        return;
      }

      for (const goal of goals) {
        let updated = false;

        // Check if we already updated this goal today
        const lastUpdate = new Date(goal.updatedAt);
        lastUpdate.setHours(0, 0, 0, 0);
        
        if (lastUpdate.getTime() >= today.getTime()) {
          // Already updated today, skip
          continue;
        }

        // Logic for Daily Logging Goal
        if (goal.goalType === 'daily_logging') {
          goal.currentStreak += 1;
          goal.currentValue += 1;
          updated = true;
        }
        // Logic for Sleep Improvement Goal
        else if (goal.goalType === 'sleep_improvement' && todayEntry.sleepHours) {
          if (todayEntry.sleepHours >= goal.targetValue) {
            goal.currentStreak += 1;
            goal.currentValue = todayEntry.sleepHours;
            updated = true;
          } else {
            // Reset streak if target not met
            goal.currentStreak = 0;
            goal.currentValue = todayEntry.sleepHours;
            updated = true;
          }
        }
        // Logic for Exercise Frequency Goal
        else if (goal.goalType === 'exercise_frequency' && todayEntry.exerciseMinutes) {
          if (todayEntry.exerciseMinutes >= goal.targetValue) {
            goal.currentStreak += 1;
            goal.currentValue = todayEntry.exerciseMinutes;
            updated = true;
          } else {
            // Reset streak if target not met
            goal.currentStreak = 0;
            goal.currentValue = todayEntry.exerciseMinutes;
            updated = true;
          }
        }
        // Logic for Mood Improvement Goal
        else if (goal.goalType === 'mood_improvement') {
          if (todayEntry.rating >= goal.targetValue) {
            goal.currentStreak += 1;
            goal.currentValue = todayEntry.rating;
            updated = true;
          } else {
            goal.currentStreak = 0;
            goal.currentValue = todayEntry.rating;
            updated = true;
          }
        }

        if (updated) {
          // Update longest streak
          if (goal.currentStreak > goal.longestStreak) {
            goal.longestStreak = goal.currentStreak;
          }

          // Check for milestones (every 7 days)
          if (goal.currentStreak > 0 && goal.currentStreak % 7 === 0) {
            if (!goal.milestones) goal.milestones = [];
            
            // Check if this milestone already exists
            const milestoneExists = goal.milestones.some(
              (m: any) => m.value === goal.currentStreak
            );
            
            if (!milestoneExists) {
              goal.milestones.push({
                value: goal.currentStreak,
                isAchieved: true,
                achievedAt: new Date(),
              });
            }
          }

          // Check if goal is achieved
          if (goal.currentStreak >= goal.targetValue) {
            goal.isAchieved = true;
          }

          await this.moodGoalRepository.save(goal);
          this.logger.log(
            `Updated goal ${goal.id}: streak=${goal.currentStreak}, value=${goal.currentValue}`
          );
        }
      }

      // Invalidate cache
      await this.redisService.del(`mood:goals:${userId}`);
    } catch (error) {
      this.logger.error(`Failed to check goals progress: ${error.message}`, error.stack);
    }
  }

  private transformToMoodGoalResponse(goal: MoodGoal): MoodGoalResponseDto {
    return {
      id: goal.id,
      userId: goal.userId,
      goalType: goal.goalType,
      targetValue: parseFloat(goal.targetValue.toString()),
      currentValue: parseFloat(goal.currentValue.toString()),
      targetDate: goal.targetDate?.toISOString().split('T')[0],
      isAchieved: goal.isAchieved,
      isActive: goal.isActive,
      description: goal.description,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      currentStreak: goal.currentStreak,
      longestStreak: goal.longestStreak,
      milestones: goal.milestones || [],
    };
  }

  private validateGoalTarget(goalType: string, targetValue: number): void {
    switch (goalType) {
      case 'daily_entries':
        if (targetValue > 10) {
          throw new BadRequestException('Daily entries target cannot exceed 10');
        }
        break;
      case 'sleep_hours':
        if (targetValue > 24) {
          throw new BadRequestException('Sleep hours target cannot exceed 24');
        }
        break;
      case 'exercise_minutes':
        if (targetValue > 1440) {
          throw new BadRequestException(
            'Exercise minutes target cannot exceed 1440 (24 hours)',
          );
        }
        break;
      case 'stress_level':
      case 'energy_level':
        if (targetValue > 5) {
          throw new BadRequestException(
            'Level targets cannot exceed 5 (maximum rating)',
          );
        }
        break;
      default:
        // Default safety cap for unknown types
        if (targetValue > 10000) {
          throw new BadRequestException('Target value is too high');
        }
    }
  }
}
