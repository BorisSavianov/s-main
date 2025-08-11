// src/auth/user.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { User, UserRole } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';

import { RedisService } from '../redis/redis.service';
import { SessionService } from './session.service';

import {
  UpdateProfileDto,
  UserResponseDto,
  CounselorProfileResponseDto,
} from './dto/auth.dto';
import { NotificationServiceClient } from 'apps/notification-service/src/clients/notification-service.client';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectRepository(CounselorProfile)
    private readonly counselorProfileRepository: Repository<CounselorProfile>,
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
    private readonly notificationClient: NotificationServiceClient,
  ) {}

  async getUserById(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['counselorProfile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.transformToUserResponse(user);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
      relations: ['counselorProfile'],
    });
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['counselorProfile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update user fields
    Object.assign(user, updateProfileDto);

    const updatedUser = await this.userRepository.save(user);

    // Invalidate user cache
    await this.redisService.invalidateUserCache(userId);

    this.logger.log(`User profile updated: ${userId}`);

    return this.transformToUserResponse(updatedUser);
  }

  async verifyEmail(token: string): Promise<void> {
    // Get user ID from Redis
    const userId = await this.redisService.get(`email_verification:${token}`);

    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Update user verification status
    await this.userRepository.update(userId, { isVerified: true });

    // Remove verification token
    await this.redisService.del(`email_verification:${token}`);

    // Invalidate user cache
    await this.redisService.invalidateUserCache(userId);

    // Send welcome email
    await this.notificationClient.sendWelcomeEmail(user.email, user.firstName!);

    this.logger.log(`Email verified for user: ${userId}`);
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Generate new verification token
    const verificationToken = uuidv4();

    // Store verification token in Redis (24 hours)
    await this.redisService.set(
      `email_verification:${verificationToken}`,
      userId,
      86400, // 24 hours
    );

    // Send verification email
    await this.notificationClient.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    this.logger.log(`Verification email resent for user: ${userId}`);
  }

  async reportSuspiciousActivity(
    userId: string,
    activityType: string,
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(
          `Suspicious activity reported for non-existent user: ${userId}`,
        );
        return;
      }

      // Send suspicious activity alert
      await this.notificationClient.sendSuspiciousActivityEmail(
        user.email,
        user.firstName!,
        activityType,
        new Date(),
      );

      this.logger.warn(
        `Suspicious activity reported for user ${user.email}: ${activityType}`,
        details,
      );
    } catch (error) {
      this.logger.error(
        `Failed to report suspicious activity: ${error.message}`,
        error.stack,
      );
      // Don't throw error for this operation
    }
  }

  async deactivateAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Deactivate user
    await this.userRepository.update(userId, { isActive: false });

    // Invalidate all user sessions
    await this.sessionService.invalidateAllUserSessions(userId);

    // Invalidate user cache
    await this.redisService.invalidateUserCache(userId);

    this.logger.log(`Account deactivated for user: ${userId}`);
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete user
    await this.userRepository.update(userId, {
      deletedAt: new Date(),
      isActive: false,
    });

    // Invalidate all user sessions
    await this.sessionService.invalidateAllUserSessions(userId);

    // Invalidate user cache
    await this.redisService.invalidateUserCache(userId);

    this.logger.log(`Account deleted for user: ${userId}`);
  }

  async getUserSessions(userId: string): Promise<any[]> {
    const sessions = await this.sessionRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.sessionService.invalidateSession(sessionId);

    this.logger.log(`Session revoked: ${sessionId} for user: ${userId}`);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLogin: new Date() });
  }

  async incrementLoginAttempts(userId: string): Promise<void> {
    const key = `login_attempts:${userId}`;
    const attempts = await this.redisService.incr(key);

    if (attempts === 1) {
      await this.redisService.expire(key, 3600); // 1 hour
    }

    // Lock account after 5 failed attempts
    if (attempts >= 5) {
      await this.userRepository.update(userId, { isActive: false });
      await this.redisService.del(key);

      this.logger.warn(
        `Account locked due to too many failed login attempts: ${userId}`,
      );
    }
  }

  async resetLoginAttempts(userId: string): Promise<void> {
    const key = `login_attempts:${userId}`;
    await this.redisService.del(key);
  }

  async getLoginAttempts(userId: string): Promise<number> {
    const key = `login_attempts:${userId}`;
    const attempts = await this.redisService.get(key);
    return attempts ? parseInt(attempts, 10) : 0;
  }

  private transformToUserResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth?.toISOString().split('T')[0],
      gender: user.gender,
      timezone: user.timezone,
      profilePictureUrl: user.profilePictureUrl,
      isActive: user.isActive,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      counselorProfile: user.counselorProfile
        ? this.transformToCounselorProfileResponse(user.counselorProfile)
        : undefined,
    };
  }

  private transformToCounselorProfileResponse(
    profile: CounselorProfile,
  ): CounselorProfileResponseDto {
    return {
      id: profile.id,
      licenseNumber: profile.licenseNumber!,
      specialties: profile.specialties || [],
      qualifications: profile.qualifications || [],
      experienceYears: profile.experienceYears || 0,
      hourlyRate: profile.hourlyRate || 0,
      bio: profile.bio || '',
      languages: profile.languages || [],
      isAvailable: profile.isAvailable,
      rating: profile.rating || 0,
      totalReviews: profile.totalReviews || 0,
    };
  }
}
