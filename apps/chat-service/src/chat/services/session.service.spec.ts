import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { ChatSession } from '../entities/chat-session.entity';
import { CreateSessionDto, SessionType } from '../dto/create-session.dto';
import { NotFoundException } from '@nestjs/common';

// Define the token manually since import is failing
const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('SessionService', () => {
  let service: SessionService;
  let sessionRepository: any;
  let redis: any;

  const mockSessionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 5 }),
    })),
  };

  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(ChatSession),
          useValue: mockSessionRepository,
        },
        {
          provide: REDIS_TOKEN,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    sessionRepository = module.get(getRepositoryToken(ChatSession));
    redis = module.get(REDIS_TOKEN);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a session and cache it', async () => {
      const createSessionDto: CreateSessionDto = {
        userId: 'user-1',
        sessionType: SessionType.ANONYMOUS,
      };

      const savedSession = {
        id: 'session-1',
        ...createSessionDto,
        sessionToken: 'token',
        isActive: true,
        startedAt: new Date(),
      };

      mockSessionRepository.create.mockReturnValue(savedSession);
      mockSessionRepository.save.mockResolvedValue(savedSession);

      const result = await service.createSession(createSessionDto);

      expect(result.id).toBe('session-1');
      expect(mockSessionRepository.save).toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalled();
      expect(redis.zadd).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('should return cached session if available', async () => {
      const cachedSession = { id: 'session-1', isActive: true };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedSession));

      const result = await service.getSession('session-1');

      expect(result.id).toBe('session-1');
      expect(mockSessionRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from db if cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      const session = { id: 'session-1', isActive: true };
      mockSessionRepository.findOne.mockResolvedValue(session);

      const result = await service.getSession('session-1');

      expect(result.id).toBe('session-1');
      expect(mockSessionRepository.findOne).toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalled();
    });

    it('should throw NotFoundException if not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.getSession('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('endSession', () => {
    it('should end a session', async () => {
      const session = { id: 'session-1', isActive: true };
      mockSessionRepository.findOne.mockResolvedValue(session);
      mockSessionRepository.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.endSession({ sessionId: 'session-1' });

      expect(result.isActive).toBe(false);
      expect(redis.del).toHaveBeenCalled();
      expect(redis.zrem).toHaveBeenCalled();
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('should cleanup inactive sessions', async () => {
      const result = await service.cleanupInactiveSessions();
      expect(result).toBe(5);
    });
  });
});
