// apps/notification-service/src/preferences/services/notification-preferences.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-prefrence.entity';
import { NotificationType } from '../../notifications/entities/notification.entity';

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @InjectRepository(NotificationPreference)
    private preferencesRepository: Repository<NotificationPreference>,
  ) {}

  async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.preferencesRepository.find({
      where: { userId },
      order: { notificationCategory: 'ASC' },
    });
  }

  async getPreferenceByCategory(
    userId: string,
    category: string,
  ): Promise<NotificationPreference | null> {
    return this.preferencesRepository.findOne({
      where: { userId, notificationCategory: category },
    });
  }

  async updatePreferences(
    userId: string,
    preferences: Partial<NotificationPreference>[],
  ): Promise<NotificationPreference[]> {
    const updatedPreferences: NotificationPreference[] = [];

    for (const pref of preferences) {
      let existingPreference = await this.getPreferenceByCategory(
        userId,
        pref.notificationCategory!,
      );

      if (existingPreference) {
        Object.assign(existingPreference, pref);
        existingPreference =
          await this.preferencesRepository.save(existingPreference);
      } else {
        const newPreference = this.preferencesRepository.create({
          userId,
          ...pref,
        });
        existingPreference =
          await this.preferencesRepository.save(newPreference);
      }

      updatedPreferences.push(existingPreference);
    }

    return updatedPreferences;
  }

  async shouldSendNotification(
    userId: string,
    category: string,
    type: NotificationType,
    scheduledTime: Date,
  ): Promise<boolean> {
    const preference = await this.getPreferenceByCategory(userId, category);

    // If no preferences found, use default behavior (allow)
    if (!preference) {
      return true;
    }

    // Check if the notification type is enabled
    switch (type) {
      case NotificationType.EMAIL:
        if (!preference.emailEnabled) return false;
        break;
      case NotificationType.SMS:
        if (!preference.smsEnabled) return false;
        break;
      case NotificationType.PUSH:
        if (!preference.pushEnabled) return false;
        break;
      case NotificationType.IN_APP:
        if (!preference.inAppEnabled) return false;
        break;
    }

    // Check frequency settings
    if (preference.frequency === 'disabled') {
      return false;
    }

    // Check quiet hours
    if (this.isInQuietHours(preference, scheduledTime)) {
      return false;
    }

    return true;
  }

  private isInQuietHours(
    preference: NotificationPreference,
    scheduledTime: Date,
  ): boolean {
    if (!preference.quietHoursStart || !preference.quietHoursEnd) {
      return false;
    }

    const scheduledTimeStr = scheduledTime.toTimeString().slice(0, 5);
    const startTime = preference.quietHoursStart;
    const endTime = preference.quietHoursEnd;

    // Handle quiet hours that span midnight
    if (startTime <= endTime) {
      return scheduledTimeStr >= startTime && scheduledTimeStr <= endTime;
    } else {
      return scheduledTimeStr >= startTime || scheduledTimeStr <= endTime;
    }
  }

  async initializeDefaultPreferences(userId: string): Promise<void> {
    const defaultCategories = [
      'appointments',
      'mood_reminders',
      'system',
      'marketing',
    ];

    const existingPreferences = await this.getUserPreferences(userId);
    const existingCategories = existingPreferences.map(
      (p) => p.notificationCategory,
    );

    for (const category of defaultCategories) {
      if (!existingCategories.includes(category)) {
        const defaultPreference = this.preferencesRepository.create({
          userId,
          notificationCategory: category,
          emailEnabled: category !== 'marketing', // Marketing disabled by default
          smsEnabled: false,
          pushEnabled: category !== 'marketing',
          inAppEnabled: true,
          frequency: 'immediate',
        });

        await this.preferencesRepository.save(defaultPreference);
      }
    }
  }
}
