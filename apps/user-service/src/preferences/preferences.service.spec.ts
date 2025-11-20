import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreferencesService } from './preferences.service';
import { UserPreferences } from '../database/entities/user-preferences.entity';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let repository: Repository<UserPreferences>;
  let mockRepository: any;
  let mockRedis: any;
  let mockPreferences: UserPreferences;

  beforeEach(async () => {
    mockPreferences = {
      id: 'pref-123',
      userId: 'user-123',
      webSearchEnabled: false,
      emailNotifications: true,
      pushNotifications: true,
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserPreferences;

    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesService,
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: mockRepository,
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
    repository = module.get<Repository<UserPreferences>>(
      getRepositoryToken(UserPreferences),
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserPreferences', () => {
    it('should return cached preferences if available', async () => {
      const cachedPreferences = {
        ...mockPreferences,
        createdAt: mockPreferences.createdAt.toISOString(),
        updatedAt: mockPreferences.updatedAt.toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedPreferences));

      const result = await service.getUserPreferences('user-123');

      expect(result).toEqual(cachedPreferences);
      expect(mockRedis.get).toHaveBeenCalledWith('preferences:user-123');
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('should return preferences from db and cache them', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(mockPreferences);

      const result = await service.getUserPreferences('user-123');

      expect(result).toEqual(mockPreferences);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'preferences:user-123',
        3600,
        expect.any(String),
      );
    });

    it('should create default preferences if not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockPreferences);
      mockRepository.save.mockResolvedValue(mockPreferences);

      const result = await service.getUserPreferences('user-123');

      expect(result).toEqual(mockPreferences);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' }),
      );
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences and invalidate cache', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);
      const updatedPreferences = { ...mockPreferences, theme: 'dark' };
      mockRepository.save.mockResolvedValue(updatedPreferences);

      const result = await service.updatePreferences('user-123', {
        theme: 'dark',
      });

      expect(result.theme).toBe('dark');
      expect(repository.save).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'preferences:user-123',
        3600,
        expect.any(String),
      );
    });
  });

  describe('toggleWebSearch', () => {
    it('should toggle web search preference', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);
      const updatedPreferences = { ...mockPreferences, webSearchEnabled: true };
      mockRepository.save.mockResolvedValue(updatedPreferences);

      const result = await service.toggleWebSearch('user-123', true);

      expect(result.webSearchEnabled).toBe(true);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('isWebSearchEnabled', () => {
    it('should return true if enabled', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ ...mockPreferences, webSearchEnabled: true }),
      );

      const result = await service.isWebSearchEnabled('user-123');

      expect(result).toBe(true);
    });

    it('should return false if disabled', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ ...mockPreferences, webSearchEnabled: false }),
      );

      const result = await service.isWebSearchEnabled('user-123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.isWebSearchEnabled('user-123');

      expect(result).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cache', async () => {
      await service.clearCache('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith('preferences:user-123');
    });
  });
});
