// apps/mood-service/src/mood-goals/mood-goals.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MoodGoal } from '../database/entities/mood-goal.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateMoodGoalDto,
  UpdateMoodGoalDto,
  MoodGoalSearchDto,
  MoodGoalResponseDto,
} from './dto/mood-goals.dto';

@Injectable()
export class MoodGoalsService {
  private readonly logger = new Logger(MoodGoalsService.name);

  constructor(
    @InjectRepository(MoodGoal)
    private readonly moodGoalRepository: Repository<MoodGoal>,
    private readonly redisService: RedisService,
  ) {}

  async createMoodGoal(
    userId: string,
    createMoodGoalDto: CreateMoodGoalDto,
  ): Promise<MoodGoalResponseDto> {
    const { targetDate, ...goalData } = createMoodGoalDto;

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
    };
  }
}
