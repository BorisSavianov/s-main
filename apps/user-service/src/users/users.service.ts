// apps/user-service/src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';

import { User, UserRole } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { RedisService } from '../redis/redis.service';

import {
  UpdateProfileDto,
  UserResponseDto,
  UserSearchDto,
  PaginatedUsersResponseDto,
} from './dto/users.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly redisService: RedisService,
  ) {}

  async getUserById(userId: string): Promise<UserResponseDto> {
    // Try to get from cache first
    const cached = await this.redisService.get(`user:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['counselorProfile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userResponse = this.transformToUserResponse(user);

    // Cache for 5 minutes
    await this.redisService.set(
      `user:${userId}`,
      JSON.stringify(userResponse),
      300,
    );

    return userResponse;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
      relations: ['counselorProfile'],
    });
  }

  async searchUsers(
    searchDto: UserSearchDto,
  ): Promise<PaginatedUsersResponseDto> {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      isActive,
      isVerified,
    } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.counselorProfile', 'counselorProfile');

    // Apply search filters
    if (search) {
      queryBuilder.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (typeof isActive === 'boolean') {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    if (typeof isVerified === 'boolean') {
      queryBuilder.andWhere('user.isVerified = :isVerified', { isVerified });
    }

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Order by creation date (newest first)
    queryBuilder.orderBy('user.createdAt', 'DESC');

    const [users, total] = await queryBuilder.getManyAndCount();

    const transformedUsers = users.map((user) =>
      this.transformToUserResponse(user),
    );

    return {
      users: transformedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
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

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);

    this.logger.log(`User profile updated: ${userId}`);

    return this.transformToUserResponse(updatedUser);
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
    await this.invalidateAllUserSessions(userId);

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);

    this.logger.log(`Account deleted for user: ${userId}`);
  }

  async activateAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, { isActive: true });

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);

    this.logger.log(`Account activated for user: ${userId}`);
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
    await this.invalidateAllUserSessions(userId);

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);

    this.logger.log(`Account deactivated for user: ${userId}`);
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

    // Mark session as inactive
    await this.sessionRepository.update(sessionId, { isActive: false });

    // Remove from Redis cache
    await this.redisService.del(`session:${sessionId}`);

    this.logger.log(`Session revoked: ${sessionId} for user: ${userId}`);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLogin: new Date() });

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);
  }

  async getUserStats(): Promise<any> {
    const totalUsers = await this.userRepository.count();
    const activeUsers = await this.userRepository.count({
      where: { isActive: true },
    });
    const verifiedUsers = await this.userRepository.count({
      where: { isVerified: true },
    });
    const counselors = await this.userRepository.count({
      where: { role: UserRole.COUNSELOR },
    });

    return {
      totalUsers,
      activeUsers,
      verifiedUsers,
      counselors,
      inactiveUsers: totalUsers - activeUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
    };
  }

  private async invalidateAllUserSessions(userId: string): Promise<void> {
    // Mark all user sessions as inactive
    await this.sessionRepository.update(
      { userId, isActive: true },
      { isActive: false },
    );

    // Remove all user sessions from Redis
    const sessions = await this.sessionRepository.find({
      where: { userId },
    });

    for (const session of sessions) {
      await this.redisService.del(`session:${session.id}`);
    }
  }

  private transformToUserResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth
        ? user.dateOfBirth instanceof Date
          ? user.dateOfBirth.toISOString().split('T')[0]
          : user.dateOfBirth
        : undefined,
      gender: user.gender,
      timezone: user.timezone,
      profilePictureUrl: user.profilePictureUrl,
      isActive: user.isActive,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin
        ? user.lastLogin instanceof Date
          ? user.lastLogin.toISOString()
          : user.lastLogin
        : undefined,
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
      updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
    };
  }
}
