import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CounselorsService } from './counselors.service';
import { User, UserRole } from '../database/entities/user.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';
import { RedisService } from '../redis/redis.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

describe('CounselorsService', () => {
  let service: CounselorsService;
  let userRepository: Repository<User>;
  let counselorProfileRepository: Repository<CounselorProfile>;
  let redisService: RedisService;
  let mockQueryBuilder: any;
  let mockCounselorProfileRepository: any;
  let mockRedisService: any;
  let mockUserRepository: any;

  const mockUser: User = {
    id: 'user-123',
    email: 'counselor@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.COUNSELOR,
    isActive: true,
    counselorProfile: null,
  } as unknown as User;

  const mockCounselorProfile: CounselorProfile = {
    id: 'profile-123',
    userId: 'user-123',
    licenseNumber: 'LIC-12345',
    specialties: ['Anxiety', 'Depression'],
    qualifications: ['PhD'],
    experienceYears: 10,
    hourlyRate: 150,
    bio: 'Experienced counselor',
    languages: ['English'],
    isAvailable: true,
    rating: 4.5,
    totalReviews: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: mockUser,
  } as CounselorProfile;

  beforeEach(async () => {
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockCounselorProfile], 1]),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ avgRating: '4.5' }),
    };

    mockCounselorProfileRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockUserRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CounselorsService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(CounselorProfile),
          useValue: mockCounselorProfileRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<CounselorsService>(CounselorsService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    counselorProfileRepository = module.get<Repository<CounselorProfile>>(
      getRepositoryToken(CounselorProfile),
    );
    redisService = module.get<RedisService>(RedisService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCounselorProfile', () => {
    it('should create counselor profile', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (counselorProfileRepository.findOne as jest.Mock).mockResolvedValue(null);
      (counselorProfileRepository.create as jest.Mock).mockReturnValue(
        mockCounselorProfile,
      );
      (counselorProfileRepository.save as jest.Mock).mockResolvedValue(
        mockCounselorProfile,
      );

      const result = await service.createCounselorProfile('user-123', {
        licenseNumber: 'LIC-12345',
        specialties: ['Anxiety'],
        qualifications: ['PhD'],
        experienceYears: 10,
        hourlyRate: 150,
        bio: 'Bio',
        languages: ['English'],
      });

      expect(result.licenseNumber).toBe('LIC-12345');
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-123');
    });

    it('should throw ForbiddenException if user is not a counselor', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        role: UserRole.USER,
      });

      await expect(
        service.createCounselorProfile('user-123', {} as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if profile already exists', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        counselorProfile: mockCounselorProfile,
      });

      await expect(
        service.createCounselorProfile('user-123', {} as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getCounselorProfile', () => {
    it('should return cached profile if available', async () => {
      const cachedProfile = {
        ...mockCounselorProfile,
        createdAt: mockCounselorProfile.createdAt.toISOString(),
        updatedAt: mockCounselorProfile.updatedAt.toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedProfile));

      const result = await service.getCounselorProfile('user-123');

      expect(result).toEqual(cachedProfile);
      expect(mockRedisService.get).toHaveBeenCalledWith('counselor:user-123');
    });

    it('should return profile from db and cache it', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        counselorProfile: mockCounselorProfile,
      });

      const result = await service.getCounselorProfile('user-123');

      expect(result.id).toBe(mockCounselorProfile.id);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'counselor:user-123',
        expect.any(String),
        600,
      );
    });
  });

  describe('searchCounselors', () => {
    it('should return paginated counselors', async () => {
      const result = await service.searchCounselors({ page: 1, limit: 10 });

      expect(result.counselors).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('updateCounselorProfile', () => {
    it('should update profile and invalidate cache', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        counselorProfile: mockCounselorProfile,
      });
      mockCounselorProfileRepository.save.mockResolvedValue({
        ...mockCounselorProfile,
        hourlyRate: 200,
      });

      const result = await service.updateCounselorProfile('user-123', {
        hourlyRate: 200,
      });

      expect(result.hourlyRate).toBe(200);
      expect(mockRedisService.del).toHaveBeenCalledWith('counselor:user-123');
    });
  });

  describe('deleteCounselorProfile', () => {
    it('should delete profile and invalidate cache', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        counselorProfile: mockCounselorProfile,
      });

      await service.deleteCounselorProfile('user-123');

      expect(counselorProfileRepository.remove).toHaveBeenCalled();
      expect(mockRedisService.del).toHaveBeenCalledWith('counselor:user-123');
    });
  });

  describe('updateAvailability', () => {
    it('should update availability', async () => {
      mockCounselorProfileRepository.findOne.mockResolvedValue(
        mockCounselorProfile,
      );

      await service.updateAvailability('user-123', false);

      expect(counselorProfileRepository.update).toHaveBeenCalledWith(
        { userId: 'user-123' },
        { isAvailable: false },
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('counselor:user-123');
    });
  });

  describe('getAllSpecialties', () => {
    it('should return specialties from cache', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify(['Anxiety', 'Depression']),
      );

      const result = await service.getAllSpecialties();

      expect(result).toEqual(['Anxiety', 'Depression']);
    });

    it('should return specialties from db and cache them', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { specialty: 'Anxiety' },
        { specialty: 'Depression' },
      ]);

      const result = await service.getAllSpecialties();

      expect(result).toEqual(['Anxiety', 'Depression']);
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  describe('getCounselorStats', () => {
    it('should return stats', async () => {
      (counselorProfileRepository.count as jest.Mock).mockResolvedValueOnce(10); // total
      (counselorProfileRepository.count as jest.Mock).mockResolvedValueOnce(8); // available
      mockQueryBuilder.getRawOne.mockResolvedValue({ avgRating: '4.5' });
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { specialty: 'Anxiety', count: '5' },
        { specialty: 'Depression', count: '3' },
      ]);

      const result = await service.getCounselorStats();

      expect(result).toEqual({
        totalCounselors: 10,
        availableCounselors: 8,
        unavailableCounselors: 2,
        averageRating: 4.5,
        topSpecialties: [
          { specialty: 'Anxiety', count: 5 },
          { specialty: 'Depression', count: 3 },
        ],
      });
    });
  });
});
