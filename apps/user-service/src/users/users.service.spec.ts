import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User, UserRole } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { RedisService } from '../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: Repository<User>;
  let sessionRepository: Repository<UserSession>;
  let redisService: RedisService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashedpassword',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    isActive: true,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    counselorProfile: null,
    preferences: null,
    sessions: [],
    sentMessages: [],
    receivedMessages: [],
    hashPassword: jest.fn(),
    validatePassword: jest.fn(),
  } as unknown as User;

  const mockUserResponse = {
    id: mockUser.id,
    email: mockUser.email,
    firstName: mockUser.firstName,
    lastName: mockUser.lastName,
    role: mockUser.role,
    isActive: mockUser.isActive,
    isVerified: mockUser.isVerified,
    createdAt: mockUser.createdAt.toISOString(),
    updatedAt: mockUser.updatedAt.toISOString(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockUser], 1]),
    })),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

  const mockSessionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(UserSession),
          useValue: mockSessionRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    sessionRepository = module.get<Repository<UserSession>>(
      getRepositoryToken(UserSession),
    );
    redisService = module.get<RedisService>(RedisService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserById', () => {
    it('should return cached user if available', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockUserResponse));

      const result = await service.getUserById('user-123');

      expect(result).toEqual(mockUserResponse);
      expect(mockRedisService.get).toHaveBeenCalledWith('user:user-123');
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return user from db and cache it if not in cache', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserById('user-123');

      expect(result).toEqual(expect.objectContaining({ id: mockUser.id }));
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        relations: ['counselorProfile'],
      });
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'user:user-123',
        expect.any(String),
        300,
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserById('user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserByEmail', () => {
    it('should return user by email', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        relations: ['counselorProfile'],
      });
    });
  });

  describe('searchUsers', () => {
    it('should return paginated users', async () => {
      const result = await service.searchUsers({ page: 1, limit: 10 });

      expect(result.users).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(userRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should apply filters', async () => {
      await service.searchUsers({
        search: 'John',
        role: UserRole.USER,
        isActive: true,
        isVerified: true,
      });

      expect(userRepository.createQueryBuilder).toHaveBeenCalled();
      // Verification of specific query builder calls would require more complex mocking or integration tests
    });
  });

  describe('updateProfile', () => {
    it('should update user profile and invalidate cache', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        firstName: 'Jane',
      });

      const result = await service.updateProfile('user-123', {
        firstName: 'Jane',
      });

      expect(result.firstName).toBe('Jane');
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-123');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile('user-123', { firstName: 'Jane' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('should soft delete user and invalidate sessions/cache', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockSessionRepository.find.mockResolvedValue([
        { id: 'session-1', userId: 'user-123' },
      ]);

      await service.deleteAccount('user-123');

      expect(userRepository.update).toHaveBeenCalledWith('user-123', {
        deletedAt: expect.any(Date),
        isActive: false,
      });
      expect(sessionRepository.update).toHaveBeenCalledWith(
        { userId: 'user-123', isActive: true },
        { isActive: false },
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-123');
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-1');
    });
  });

  describe('activateAccount', () => {
    it('should activate account', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await service.activateAccount('user-123');

      expect(userRepository.update).toHaveBeenCalledWith('user-123', {
        isActive: true,
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-123');
    });
  });

  describe('deactivateAccount', () => {
    it('should deactivate account and invalidate sessions', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockSessionRepository.find.mockResolvedValue([]);

      await service.deactivateAccount('user-123');

      expect(userRepository.update).toHaveBeenCalledWith('user-123', {
        isActive: false,
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-123');
    });
  });

  describe('getUserSessions', () => {
    it('should return active sessions', async () => {
      const mockSession = {
        id: 'session-1',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla',
        createdAt: new Date(),
        expiresAt: new Date(),
      };
      mockSessionRepository.find.mockResolvedValue([mockSession]);

      const result = await service.getUserSessions('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session-1');
    });
  });

  describe('revokeSession', () => {
    it('should revoke session', async () => {
      mockSessionRepository.findOne.mockResolvedValue({ id: 'session-1' });

      await service.revokeSession('user-123', 'session-1');

      expect(sessionRepository.update).toHaveBeenCalledWith('session-1', {
        isActive: false,
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('session:session-1');
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login', async () => {
      await service.updateLastLogin('user-123');

      expect(userRepository.update).toHaveBeenCalledWith('user-123', {
        lastLogin: expect.any(Date),
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-123');
    });
  });

  describe('getUserStats', () => {
    it('should return user stats', async () => {
      mockUserRepository.count.mockResolvedValueOnce(100); // total
      mockUserRepository.count.mockResolvedValueOnce(80); // active
      mockUserRepository.count.mockResolvedValueOnce(50); // verified
      mockUserRepository.count.mockResolvedValueOnce(5); // counselors

      const result = await service.getUserStats();

      expect(result).toEqual({
        totalUsers: 100,
        activeUsers: 80,
        verifiedUsers: 50,
        counselors: 5,
        inactiveUsers: 20,
        unverifiedUsers: 50,
      });
    });
  });
});
