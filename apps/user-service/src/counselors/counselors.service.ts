// apps/user-service/src/counselors/counselors.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, UserRole } from '../database/entities/user.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';
import { RedisService } from '../redis/redis.service';

import {
  CreateCounselorProfileDto,
  UpdateCounselorProfileDto,
  CounselorSearchDto,
  CounselorResponseDto,
  PaginatedCounselorsResponseDto,
} from './dto/counselors.dto';

@Injectable()
export class CounselorsService {
  private readonly logger = new Logger(CounselorsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CounselorProfile)
    private readonly counselorProfileRepository: Repository<CounselorProfile>,
    private readonly redisService: RedisService,
  ) {}

  async createCounselorProfile(
    userId: string,
    createCounselorProfileDto: CreateCounselorProfileDto,
  ): Promise<CounselorResponseDto> {
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
    if (createCounselorProfileDto.licenseNumber) {
      const existingProfile = await this.counselorProfileRepository.findOne({
        where: { licenseNumber: createCounselorProfileDto.licenseNumber },
      });

      if (existingProfile) {
        throw new ConflictException('License number already exists');
      }
    }

    // Create counselor profile
    const counselorProfile = this.counselorProfileRepository.create({
      ...createCounselorProfileDto,
      userId,
    });

    const savedProfile =
      await this.counselorProfileRepository.save(counselorProfile);

    // Invalidate user cache
    await this.redisService.del(`user:${userId}`);
    await this.redisService.del(`counselor:${userId}`);

    this.logger.log(`Counselor profile created for user: ${userId}`);

    return this.transformToCounselorResponse(savedProfile, user);
  }

  async getCounselorProfile(userId: string): Promise<CounselorResponseDto> {
    // Try to get from cache first
    const cached = await this.redisService.get(`counselor:${userId}`);
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

    if (!user.counselorProfile) {
      throw new NotFoundException('Counselor profile not found');
    }

    const counselorResponse = this.transformToCounselorResponse(
      user.counselorProfile,
      user,
    );

    // Cache for 10 minutes
    await this.redisService.set(
      `counselor:${userId}`,
      JSON.stringify(counselorResponse),
      600,
    );

    return counselorResponse;
  }

  async searchCounselors(
    searchDto: CounselorSearchDto,
  ): Promise<PaginatedCounselorsResponseDto> {
    const {
      page = 1,
      limit = 10,
      search,
      specialty,
      minRating,
      maxRate,
      language,
      isAvailable,
    } = searchDto;

    const skip = (page - 1) * limit;

    const queryBuilder = this.counselorProfileRepository
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('user.role = :role', { role: UserRole.COUNSELOR })
      .andWhere('user.isActive = :isActive', { isActive: true });

    // Apply search filters
    if (search) {
      queryBuilder.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR profile.bio ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (specialty) {
      queryBuilder.andWhere(':specialty = ANY(profile.specialties)', {
        specialty,
      });
    }

    if (minRating !== undefined) {
      queryBuilder.andWhere('profile.rating >= :minRating', { minRating });
    }

    if (maxRate !== undefined) {
      queryBuilder.andWhere('profile.hourlyRate <= :maxRate', { maxRate });
    }

    if (language) {
      queryBuilder.andWhere(':language = ANY(profile.languages)', {
        language,
      });
    }

    if (typeof isAvailable === 'boolean') {
      queryBuilder.andWhere('profile.isAvailable = :isAvailable', {
        isAvailable,
      });
    }

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Order by rating and reviews (best counselors first)
    queryBuilder.orderBy('profile.rating', 'DESC');
    queryBuilder.addOrderBy('profile.totalReviews', 'DESC');

    const [profiles, total] = await queryBuilder.getManyAndCount();

    const transformedProfiles = profiles.map((profile) =>
      this.transformToCounselorResponse(profile, profile.user),
    );

    return {
      counselors: transformedProfiles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async updateCounselorProfile(
    userId: string,
    updateDto: UpdateCounselorProfileDto,
  ): Promise<CounselorResponseDto> {
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

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);
    await this.redisService.del(`counselor:${userId}`);

    this.logger.log(`Counselor profile updated for user: ${userId}`);

    return this.transformToCounselorResponse(updatedProfile, user);
  }

  async deleteCounselorProfile(userId: string): Promise<void> {
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

    // Delete counselor profile
    await this.counselorProfileRepository.remove(user.counselorProfile);

    // Invalidate cache
    await this.redisService.del(`user:${userId}`);
    await this.redisService.del(`counselor:${userId}`);

    this.logger.log(`Counselor profile deleted for user: ${userId}`);
  }

  async updateAvailability(
    userId: string,
    isAvailable: boolean,
  ): Promise<void> {
    const profile = await this.counselorProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Counselor profile not found');
    }

    await this.counselorProfileRepository.update({ userId }, { isAvailable });

    // Invalidate cache
    await this.redisService.del(`counselor:${userId}`);

    this.logger.log(
      `Counselor availability updated: ${userId} - ${isAvailable}`,
    );
  }

  async getAllSpecialties(): Promise<string[]> {
    // Try to get from cache first
    const cached = await this.redisService.get('counselor:specialties');
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.counselorProfileRepository
      .createQueryBuilder('profile')
      .select('DISTINCT UNNEST(profile.specialties)', 'specialty')
      .getRawMany();

    const specialties = result
      .map((row) => row.specialty)
      .filter(Boolean)
      .sort();

    // Cache for 1 hour
    await this.redisService.set(
      'counselor:specialties',
      JSON.stringify(specialties),
      3600,
    );

    return specialties;
  }

  async getCounselorStats(): Promise<any> {
    const totalCounselors = await this.counselorProfileRepository.count();
    const availableCounselors = await this.counselorProfileRepository.count({
      where: { isAvailable: true },
    });

    const avgRating = await this.counselorProfileRepository
      .createQueryBuilder('profile')
      .select('AVG(profile.rating)', 'avgRating')
      .getRawOne();

    const topSpecialties = await this.counselorProfileRepository
      .createQueryBuilder('profile')
      .select('UNNEST(profile.specialties)', 'specialty')
      .addSelect('COUNT(*)', 'count')
      .groupBy('specialty')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalCounselors,
      availableCounselors,
      unavailableCounselors: totalCounselors - availableCounselors,
      averageRating: parseFloat(avgRating?.avgRating || '0'),
      topSpecialties: topSpecialties.map((item) => ({
        specialty: item.specialty,
        count: parseInt(item.count, 10),
      })),
    };
  }

  private transformToCounselorResponse(
    profile: CounselorProfile,
    user?: User,
  ): CounselorResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: user?.firstName,
      lastName: user?.lastName,
      email: user?.email,
      profilePictureUrl: user?.profilePictureUrl,
      licenseNumber: profile.licenseNumber,
      specialties: profile.specialties || [],
      qualifications: profile.qualifications || [],
      experienceYears: profile.experienceYears || 0,
      hourlyRate: profile.hourlyRate || 0,
      bio: profile.bio || '',
      languages: profile.languages || [],
      isAvailable: profile.isAvailable,
      rating: profile.rating || 0,
      totalReviews: profile.totalReviews || 0,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
