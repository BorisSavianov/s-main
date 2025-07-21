import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as uuid from 'uuid';

import { SessionService, SessionData } from './session.service';
import { UserSession } from '../database/entities/user-session.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { RedisService } from '../redis/redis.service';

// Mock uuid module
jest.mock('uuid');

const mockedUuid = uuid as jest.Mocked<typeof uuid>;

describe('SessionService', () => {
  let service: SessionService;
  let sessionRepository: jest.Mocked<Repository<UserSession>>;
  let redisService: jest.Mocked<RedisService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    role: UserRole.USER,
    firstName: 'John',
    lastName: 'Doe',
  } as User;

  const mockSessionToken = 'session-token-uuid';
  const mockSessionId = 'session-id-uuid';

  const mockUserSession = {
    id: mockSessionId,
    sessionToken: mockSessionToken,
    userId: mockUser.id,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2024-01-02T00:00:00Z'),
    user: mockUser,
  } as UserSession;

  const mockSessionData: SessionData = {
    sessionId: mockSessionId,
    userId: mockUser.id,
    email: mockUser.email,
    role: mockUser.role,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2024-01-02T00:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(UserSession),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            setSession: jest.fn(),
            getSession: jest.fn(),
            deleteSession: jest.fn(),
            invalidatePattern: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    sessionRepository = module.get(getRepositoryToken(UserSession));
    redisService = module.get(RedisService);

    // Mock Date.now for consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('createSession', () => {
    beforeEach(() => {
      (uuid.v4 as jest.Mock).mockReturnValue(mockSessionToken);
    });

    it('should create session successfully with default settings', async () => {
      sessionRepository.create.mockReturnValue(mockUserSession);
      sessionRepository.save.mockResolvedValue(mockUserSession);
      redisService.setSession.mockResolvedValue(undefined);

      const result = await service.createSession(
        mockUser,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(uuid.v4).toHaveBeenCalled();
      expect(sessionRepository.create).toHaveBeenCalledWith({
        sessionToken: mockSessionToken,
        userId: mockUser.id,
        expiresAt: new Date('2024-01-02T00:00:00Z'), // 24 hours later
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        isActive: true,
      });
      expect(sessionRepository.save).toHaveBeenCalledWith(mockUserSession);
      expect(redisService.setSession).toHaveBeenCalledWith(
        mockSessionId,
        expect.objectContaining({
          sessionId: mockSessionId,
          userId: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        }),
        86400, // 24 hours in seconds
      );
      expect(result).toEqual(mockUserSession);
    });

    it('should create session with remember me option (30 days)', async () => {
      const longExpirySession = {
        ...mockUserSession,
        expiresAt: new Date('2024-01-31T00:00:00Z'), // 30 days later
      };

      sessionRepository.create.mockReturnValue(longExpirySession);
      sessionRepository.save.mockResolvedValue(longExpirySession);
      redisService.setSession.mockResolvedValue(undefined);

      const result = await service.createSession(
        mockUser,
        '127.0.0.1',
        'Mozilla/5.0',
        true,
      );

      expect(sessionRepository.create).toHaveBeenCalledWith({
        sessionToken: mockSessionToken,
        userId: mockUser.id,
        expiresAt: new Date('2024-01-31T00:00:00Z'), // 30 days later
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        isActive: true,
      });
      expect(redisService.setSession).toHaveBeenCalledWith(
        mockSessionId,
        expect.any(Object),
        2592000, // 30 days in seconds
      );
      expect(result).toEqual(longExpirySession);
    });

    it('should create session without optional parameters', async () => {
      sessionRepository.create.mockReturnValue(mockUserSession);
      sessionRepository.save.mockResolvedValue(mockUserSession);
      redisService.setSession.mockResolvedValue(undefined);

      const result = await service.createSession(mockUser);

      expect(sessionRepository.create).toHaveBeenCalledWith({
        sessionToken: mockSessionToken,
        userId: mockUser.id,
        expiresAt: expect.any(Date),
        ipAddress: undefined,
        userAgent: undefined,
        isActive: true,
      });
      expect(result).toEqual(mockUserSession);
    });
  });

  describe('getSession', () => {
    it('should return session from Redis when active and not expired', async () => {
      // Set a future date that's definitely after our mocked time
      const futureDate = new Date('2024-01-02T00:00:00Z');
      const activeSessionData = {
        ...mockSessionData,
        expiresAt: futureDate,
      };

      redisService.getSession.mockResolvedValue(activeSessionData);

      const result = await service.getSession(mockSessionId);

      expect(redisService.getSession).toHaveBeenCalledWith(mockSessionId);
      expect(result).toEqual(activeSessionData);
      expect(sessionRepository.findOne).not.toHaveBeenCalled();
    });

    it('should remove expired session from Redis and return null', async () => {
      const expiredSessionData = {
        ...mockSessionData,
        expiresAt: new Date('2023-12-31T00:00:00Z'), // Past date
      };

      redisService.getSession.mockResolvedValue(expiredSessionData);
      redisService.deleteSession.mockResolvedValue(undefined);

      const result = await service.getSession(mockSessionId);

      expect(redisService.getSession).toHaveBeenCalledWith(mockSessionId);
      expect(redisService.deleteSession).toHaveBeenCalledWith(mockSessionId);
      expect(result).toBeNull();
    });

    it('should remove inactive session from Redis and return null', async () => {
      const inactiveSessionData = {
        ...mockSessionData,
        isActive: false,
      };

      redisService.getSession.mockResolvedValue(inactiveSessionData);
      redisService.deleteSession.mockResolvedValue(undefined);

      const result = await service.getSession(mockSessionId);

      expect(redisService.deleteSession).toHaveBeenCalledWith(mockSessionId);
      expect(result).toBeNull();
    });

    it('should check database when session not in Redis and restore to Redis', async () => {
      const futureDate = new Date('2024-01-02T00:00:00Z');
      const dbSession = {
        ...mockUserSession,
        expiresAt: futureDate,
      };

      redisService.getSession.mockResolvedValue(null);
      sessionRepository.findOne.mockResolvedValue(dbSession);
      redisService.setSession.mockResolvedValue(undefined);

      const result = await service.getSession(mockSessionId);

      expect(redisService.getSession).toHaveBeenCalledWith(mockSessionId);
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSessionId, isActive: true },
        relations: ['user'],
      });
      expect(redisService.setSession).toHaveBeenCalledWith(
        mockSessionId,
        expect.objectContaining({
          sessionId: mockSessionId,
          userId: mockUser.id,
          email: mockUser.email,
        }),
        86400, // TTL in seconds
      );
      expect(result).toEqual(
        expect.objectContaining({
          sessionId: mockSessionId,
          userId: mockUser.id,
        }),
      );
    });

    it('should return null when session not found in database', async () => {
      redisService.getSession.mockResolvedValue(null);
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.getSession(mockSessionId);

      expect(result).toBeNull();
    });

    it('should return null when database session is expired', async () => {
      const expiredDbSession = {
        ...mockUserSession,
        expiresAt: new Date('2023-12-31T00:00:00Z'), // Past date
      };

      redisService.getSession.mockResolvedValue(null);
      sessionRepository.findOne.mockResolvedValue(expiredDbSession);

      const result = await service.getSession(mockSessionId);

      expect(result).toBeNull();
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate session successfully', async () => {
      sessionRepository.update.mockResolvedValue({ affected: 1 } as any);
      redisService.deleteSession.mockResolvedValue(undefined);

      await service.invalidateSession(mockSessionId);

      expect(sessionRepository.update).toHaveBeenCalledWith(
        { id: mockSessionId },
        { isActive: false },
      );
      expect(redisService.deleteSession).toHaveBeenCalledWith(mockSessionId);
    });
  });

  describe('invalidateAllUserSessions', () => {
    it('should invalidate all user sessions successfully', async () => {
      sessionRepository.update.mockResolvedValue({ affected: 3 } as any);
      redisService.invalidatePattern.mockResolvedValue(undefined);

      await service.invalidateAllUserSessions(mockUser.id);

      expect(sessionRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, isActive: true },
        { isActive: false },
      );
      expect(redisService.invalidatePattern).toHaveBeenCalledWith(
        `session:*:${mockUser.id}`,
      );
    });
  });

  describe('extendSession', () => {
    it('should extend session successfully', async () => {
      const extendBy = 3600; // 1 hour
      const newExpiresAt = new Date('2024-01-01T01:00:00Z');

      sessionRepository.findOne.mockResolvedValue(mockUserSession);
      sessionRepository.update.mockResolvedValue({ affected: 1 } as any);
      redisService.getSession.mockResolvedValue(mockSessionData);
      redisService.setSession.mockResolvedValue(undefined);

      const result = await service.extendSession(mockSessionId, extendBy);

      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSessionId, isActive: true },
      });
      expect(sessionRepository.update).toHaveBeenCalledWith(mockSessionId, {
        expiresAt: newExpiresAt,
      });
      expect(redisService.setSession).toHaveBeenCalledWith(
        mockSessionId,
        expect.objectContaining({ expiresAt: newExpiresAt }),
        extendBy,
      );
      expect(result).toBe(true);
    });

    it('should use default extend time when not specified', async () => {
      sessionRepository.findOne.mockResolvedValue(mockUserSession);
      sessionRepository.update.mockResolvedValue({ affected: 1 } as any);
      redisService.getSession.mockResolvedValue(mockSessionData);
      redisService.setSession.mockResolvedValue(undefined);

      const result = await service.extendSession(mockSessionId);

      expect(sessionRepository.update).toHaveBeenCalledWith(mockSessionId, {
        expiresAt: new Date('2024-01-01T01:00:00Z'), // 1 hour later (default 3600 seconds)
      });
      expect(result).toBe(true);
    });

    it('should return false when session not found', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.extendSession(mockSessionId);

      expect(result).toBe(false);
      expect(sessionRepository.update).not.toHaveBeenCalled();
    });

    it('should handle case when session not in Redis cache', async () => {
      sessionRepository.findOne.mockResolvedValue(mockUserSession);
      sessionRepository.update.mockResolvedValue({ affected: 1 } as any);
      redisService.getSession.mockResolvedValue(null);

      const result = await service.extendSession(mockSessionId);

      expect(result).toBe(true);
      expect(redisService.setSession).not.toHaveBeenCalled();
    });
  });

  describe('getUserSessions', () => {
    it('should return user sessions successfully', async () => {
      const userSessions = [
        mockUserSession,
        { ...mockUserSession, id: 'another-session' },
      ];
      sessionRepository.find.mockResolvedValue(userSessions);

      const result = await service.getUserSessions(mockUser.id);

      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUser.id, isActive: true },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(userSessions);
    });

    it('should return empty array when no sessions found', async () => {
      sessionRepository.find.mockResolvedValue([]);

      const result = await service.getUserSessions(mockUser.id);

      expect(result).toEqual([]);
    });
  });

  describe('getSessionById', () => {
    it('should return session with user relation', async () => {
      sessionRepository.findOne.mockResolvedValue(mockUserSession);

      const result = await service.getSessionById(mockSessionId);

      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSessionId },
        relations: ['user'],
      });
      expect(result).toEqual(mockUserSession);
    });

    it('should return null when session not found', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.getSessionById(mockSessionId);

      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired and inactive sessions successfully', async () => {
      const expiredSessions = [
        {
          ...mockUserSession,
          id: 'expired-1',
          expiresAt: new Date('2023-12-31T00:00:00Z'),
        },
        { ...mockUserSession, id: 'inactive-1', isActive: false },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(expiredSessions),
      };

      sessionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );
      sessionRepository.remove.mockResolvedValue(expiredSessions as any);
      redisService.deleteSession.mockResolvedValue(undefined);

      await service.cleanupExpiredSessions();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'session.expiresAt < :now',
        { now: expect.any(Date) },
      );
      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith(
        'session.isActive = false',
      );
      expect(sessionRepository.remove).toHaveBeenCalledWith(expiredSessions);
      expect(redisService.deleteSession).toHaveBeenCalledTimes(2);
      expect(redisService.deleteSession).toHaveBeenCalledWith('expired-1');
      expect(redisService.deleteSession).toHaveBeenCalledWith('inactive-1');
    });

    it('should handle case when no expired sessions found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      sessionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.cleanupExpiredSessions();

      expect(sessionRepository.remove).not.toHaveBeenCalled();
      expect(redisService.deleteSession).not.toHaveBeenCalled();
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return active session count for user', async () => {
      sessionRepository.count.mockResolvedValue(3);

      const result = await service.getActiveSessionCount(mockUser.id);

      expect(sessionRepository.count).toHaveBeenCalledWith({
        where: { userId: mockUser.id, isActive: true },
      });
      expect(result).toBe(3);
    });

    it('should return zero when no active sessions found', async () => {
      sessionRepository.count.mockResolvedValue(0);

      const result = await service.getActiveSessionCount(mockUser.id);

      expect(result).toBe(0);
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid session', async () => {
      redisService.getSession.mockResolvedValue(mockSessionData);

      const result = await service.isSessionValid(mockSessionId);

      expect(result).toBe(true);
    });

    it('should return false for invalid session', async () => {
      redisService.getSession.mockResolvedValue(null);
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.isSessionValid(mockSessionId);

      expect(result).toBe(false);
    });

    it('should return false for inactive session', async () => {
      const inactiveSessionData = { ...mockSessionData, isActive: false };
      redisService.getSession.mockResolvedValue(inactiveSessionData);
      redisService.deleteSession.mockResolvedValue(undefined);

      const result = await service.isSessionValid(mockSessionId);

      expect(result).toBe(false);
    });
  });
});
