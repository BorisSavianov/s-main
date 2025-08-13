// apps/mood-service/src/mood-triggers/mood-triggers.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MoodTrigger } from '../database/entities/mood-trigger.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateMoodTriggerDto,
  UpdateMoodTriggerDto,
  MoodTriggerSearchDto,
  MoodTriggerResponseDto,
} from './dto/mood-triggers.dto';

@Injectable()
export class MoodTriggersService {
  private readonly logger = new Logger(MoodTriggersService.name);

  constructor(
    @InjectRepository(MoodTrigger)
    private readonly moodTriggerRepository: Repository<MoodTrigger>,
    private readonly redisService: RedisService,
  ) {}

  async createMoodTrigger(
    userId: string,
    createMoodTriggerDto: CreateMoodTriggerDto,
  ): Promise<MoodTriggerResponseDto> {
    // Check if trigger already exists
    const existingTrigger = await this.moodTriggerRepository.findOne({
      where: {
        userId,
        triggerName: createMoodTriggerDto.triggerName,
      },
    });

    if (existingTrigger) {
      throw new ConflictException('Mood trigger with this name already exists');
    }

    const moodTrigger = this.moodTriggerRepository.create({
      ...createMoodTriggerDto,
      userId,
    });

    const savedTrigger = await this.moodTriggerRepository.save(moodTrigger);

    // Invalidate cache
    await this.redisService.del(`mood:triggers:${userId}`);

    this.logger.log(`Mood trigger created for user: ${userId}`);

    return this.transformToMoodTriggerResponse(savedTrigger);
  }

  async getMoodTriggers(
    userId: string,
    searchDto: MoodTriggerSearchDto,
  ): Promise<any> {
    const { page = 1, limit = 20, triggerCategory, isActive } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.moodTriggerRepository
      .createQueryBuilder('trigger')
      .where('trigger.userId = :userId', { userId });

    if (triggerCategory) {
      queryBuilder.andWhere('trigger.triggerCategory = :triggerCategory', {
        triggerCategory,
      });
    }

    if (typeof isActive === 'boolean') {
      queryBuilder.andWhere('trigger.isActive = :isActive', { isActive });
    }

    queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('trigger.frequencyCount', 'DESC')
      .addOrderBy('trigger.createdAt', 'DESC');

    const [triggers, total] = await queryBuilder.getManyAndCount();

    const transformedTriggers = triggers.map((trigger) =>
      this.transformToMoodTriggerResponse(trigger),
    );

    return {
      triggers: transformedTriggers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMoodTriggerById(
    userId: string,
    triggerId: string,
  ): Promise<MoodTriggerResponseDto> {
    const trigger = await this.moodTriggerRepository.findOne({
      where: { id: triggerId, userId },
    });

    if (!trigger) {
      throw new NotFoundException('Mood trigger not found');
    }

    return this.transformToMoodTriggerResponse(trigger);
  }

  async updateMoodTrigger(
    userId: string,
    triggerId: string,
    updateMoodTriggerDto: UpdateMoodTriggerDto,
  ): Promise<MoodTriggerResponseDto> {
    const trigger = await this.moodTriggerRepository.findOne({
      where: { id: triggerId, userId },
    });

    if (!trigger) {
      throw new NotFoundException('Mood trigger not found');
    }

    Object.assign(trigger, updateMoodTriggerDto);
    const updatedTrigger = await this.moodTriggerRepository.save(trigger);

    // Invalidate cache
    await this.redisService.del(`mood:triggers:${userId}`);

    this.logger.log(`Mood trigger updated: ${triggerId} for user: ${userId}`);

    return this.transformToMoodTriggerResponse(updatedTrigger);
  }

  async deleteMoodTrigger(userId: string, triggerId: string): Promise<void> {
    const trigger = await this.moodTriggerRepository.findOne({
      where: { id: triggerId, userId },
    });

    if (!trigger) {
      throw new NotFoundException('Mood trigger not found');
    }

    await this.moodTriggerRepository.remove(trigger);

    // Invalidate cache
    await this.redisService.del(`mood:triggers:${userId}`);

    this.logger.log(`Mood trigger deleted: ${triggerId} for user: ${userId}`);
  }

  async getTopTriggers(
    userId: string,
    limit: number = 10,
  ): Promise<MoodTriggerResponseDto[]> {
    const triggers = await this.moodTriggerRepository.find({
      where: { userId, isActive: true },
      order: { frequencyCount: 'DESC' },
      take: limit,
    });

    return triggers.map((trigger) =>
      this.transformToMoodTriggerResponse(trigger),
    );
  }

  private transformToMoodTriggerResponse(
    trigger: MoodTrigger,
  ): MoodTriggerResponseDto {
    return {
      id: trigger.id,
      userId: trigger.userId,
      triggerName: trigger.triggerName,
      triggerCategory: trigger.triggerCategory,
      impactScore: trigger.impactScore,
      frequencyCount: trigger.frequencyCount,
      isActive: trigger.isActive,
      createdAt: trigger.createdAt.toISOString(),
      updatedAt: trigger.updatedAt.toISOString(),
    };
  }
}
