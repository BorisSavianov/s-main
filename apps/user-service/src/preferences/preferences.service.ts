// apps/user-service/src/preferences/preferences.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { UserPreferences } from '../database/entities/user-preferences.entity';

interface UpdatePreferencesDto {
  webSearchEnabled?: boolean;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  theme?: string;
  language?: string;
  timezone?: string;
  preferences?: Record<string, any>;
}

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    this.logger.warn(userId);

    // Check cache first
    const cached = await this.getCachedPreferences(userId);
    if (cached) {
      return cached;
    }

    // Get from database
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    // Create default preferences if not exist
    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId);
    }

    // Cache the preferences
    await this.cachePreferences(userId, preferences);

    return preferences;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    updates: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId);
    }

    // Update fields
    Object.assign(preferences, updates);

    // Save to database
    const updated = await this.preferencesRepository.save(preferences);

    // Update cache
    await this.cachePreferences(userId, updated);

    this.logger.log(`Updated preferences for user ${userId}`);

    return updated;
  }

  /**
   * Toggle web search preference
   */
  async toggleWebSearch(
    userId: string,
    enabled: boolean,
  ): Promise<UserPreferences> {
    return this.updatePreferences(userId, { webSearchEnabled: enabled });
  }

  /**
   * Check if web search is enabled for user
   */
  async isWebSearchEnabled(userId: string): Promise<boolean> {
    try {
      this.logger.error(userId);
      const preferences = await this.getUserPreferences(userId);
      return preferences.webSearchEnabled;
    } catch (error) {
      this.logger.error(
        `Failed to check web search status for user ${userId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Create default preferences
   */
  private async createDefaultPreferences(
    userId: string,
  ): Promise<UserPreferences> {
    const preferences = this.preferencesRepository.create({
      userId,
      webSearchEnabled: false,
      emailNotifications: true,
      pushNotifications: true,
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
    });

    return this.preferencesRepository.save(preferences);
  }

  /**
   * Cache preferences in Redis
   */
  private async cachePreferences(
    userId: string,
    preferences: UserPreferences,
  ): Promise<void> {
    try {
      const cacheKey = `preferences:${userId}`;
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(preferences),
      );
    } catch (error) {
      this.logger.error(`Failed to cache preferences: ${error.message}`);
    }
  }

  /**
   * Get cached preferences
   */
  private async getCachedPreferences(
    userId: string,
  ): Promise<UserPreferences | null> {
    try {
      const cacheKey = `preferences:${userId}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.error(`Failed to get cached preferences: ${error.message}`);
    }

    return null;
  }

  /**
   * Clear preferences cache
   */
  async clearCache(userId: string): Promise<void> {
    try {
      const cacheKey = `preferences:${userId}`;
      await this.redis.del(cacheKey);
    } catch (error) {
      this.logger.error(`Failed to clear preferences cache: ${error.message}`);
    }
  }
}
