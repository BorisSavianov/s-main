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
import { EmailService } from './email.service';
import { SessionService } from './session.service';

import {
  UpdateProfileDto,
  CreateCounselorProfileDto,
  UserResponseDto,
  CounselorProfileResponseDto,
} from './dto/auth.dto';

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
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService,
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
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    this.logger.log(`Verification email resent for user: ${userId}`);
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

  async createCounselorProfile(
    userId: string,
    createCounselorProfileDto: CreateCounselorProfileDto,
  ): Promise<CounselorProfileResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['counselorProfile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.COUNSELOR) {
      throw new ForbiddenException(
        'User must be a counselor to create counselor profile',
      );
    }

    if (user.counselorProfile) {
      throw new ConflictException('Counselor profile already exists');
    }

    // Check if license number is already taken
    const existingProfile = await this.counselorProfileRepository.findOne({
      where: { licenseNumber: createCounselorProfileDto.licenseNumber },
    });

    if (existingProfile) {
      throw new ConflictException('License number already exists');
    }

    // Create counselor profile
    const counselorProfile = this.counselorProfileRepository.create({
      ...createCounselorProfileDto,
      userId,
    });

    const savedProfile =
      await this.counselorProfileRepository.save(counselorProfile);

    // Invalidate user cache
    await this.redisService.invalidateUserCache(userId);

    this.logger.log(`Counselor profile created for user: ${userId}`);

    return this.transformToCounselorProfileResponse(savedProfile);
  }

  async updateCounselorProfile(
    userId: string,
    updateDto: Partial<CreateCounselorProfileDto>,
  ): Promise<CounselorProfileResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['counselorProfile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.counselorProfile) {
      throw new NotFoundException('Counselor profile not found');
    }

    // Check if license number is being updated and is unique
    if (
      updateDto.licenseNumber &&
      updateDto.licenseNumber !== user.counselorProfile.licenseNumber
    ) {
      const existingProfile = await this.counselorProfileRepository.findOne({
        where: { licenseNumber: updateDto.licenseNumber },
      });

      if (existingProfile) {
        throw new ConflictException('License number already exists');
      }
    }

    // Update counselor profile
    Object.assign(user.counselorProfile, updateDto);
    const updatedProfile = await this.counselorProfileRepository.save(
      user.counselorProfile,
    );

    // Invalidate user cache
    await this.redisService.invalidateUserCache(userId);

    this.logger.log(`Counselor profile updated for user: ${userId}`);

    return this.transformToCounselorProfileResponse(updatedProfile);
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
