import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UserService } from '../user.service';
import { SessionService } from '../session.service';
import { User, UserRole } from '../../database/entities/user.entity';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userService: jest.Mocked<UserService>;
  let sessionService: jest.Mocked<SessionService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUserResponseDto = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    role: UserRole.USER,
    isActive: true,
    firstName: 'John',
    lastName: 'Doe',
    phone: undefined,
    dateOfBirth: undefined,
    gender: undefined,
    timezone: 'UTC',
    profilePictureUrl: undefined,
    isVerified: true,
    lastLogin: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    counselorProfile: undefined,
  };

  const mockSession = {
    id: 'session-id',
    isActive: true,
    userId: mockUserResponseDto.id,
  };

  const mockPayload: JwtPayload = {
    sub: mockUserResponseDto.id,
    email: mockUserResponseDto.email,
    role: UserRole.USER,
    sessionId: 'session-id',
    iat: Date.now(),
    exp: Date.now() + 3600000,
  };

  const mockRequest = {
    headers: {
      'x-forwarded-for': '192.168.1.1',
      'user-agent': 'Mozilla/5.0',
    },
    connection: {
      remoteAddress: '127.0.0.1',
    },
    socket: {
      remoteAddress: '127.0.0.1',
    },
    get: jest.fn().mockReturnValue('Mozilla/5.0'),
    cookies: {},
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-jwt-secret'),
          },
        },
        {
          provide: UserService,
          useValue: {
            getUserById: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSession: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    userService = module.get(UserService);
    sessionService = module.get(SessionService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate payload and return user data', async () => {
      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockResolvedValue(mockUserResponseDto);

      const result = await strategy.validate(mockRequest, mockPayload);

      expect(sessionService.getSession).toHaveBeenCalledWith('session-id');
      expect(userService.getUserById).toHaveBeenCalledWith(
        mockUserResponseDto.id,
      );
      expect(result).toEqual({
        userId: mockUserResponseDto.id,
        email: mockUserResponseDto.email,
        role: mockUserResponseDto.role,
        sessionId: 'session-id',
        user: mockUserResponseDto,
      });
      expect((mockRequest as any).sessionId).toBe('session-id');
      expect((mockRequest as any).ipAddress).toBe('192.168.1.1');
      expect((mockRequest as any).userAgent).toBe('Mozilla/5.0');
    });

    it('should throw UnauthorizedException when session is not found', async () => {
      sessionService.getSession.mockResolvedValue(null);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Session expired or invalid'),
      );
      expect(sessionService.getSession).toHaveBeenCalledWith('session-id');
    });

    it('should throw UnauthorizedException when session is inactive', async () => {
      const inactiveSession = { ...mockSession, isActive: false };
      sessionService.getSession.mockResolvedValue(inactiveSession as any);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Session expired or invalid'),
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockRejectedValue(new Error('User not found'));

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
      expect(userService.getUserById).toHaveBeenCalledWith(
        mockUserResponseDto.id,
      );
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const inactiveUser = { ...mockUserResponseDto, isActive: false };
      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockResolvedValue(inactiveUser);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Account deactivated'),
      );
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      const requestWithForwardedFor = {
        ...mockRequest,
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockResolvedValue(mockUserResponseDto);

      await strategy.validate(
        requestWithForwardedFor as unknown as Request,
        mockPayload,
      );

      expect((requestWithForwardedFor as any).ipAddress).toBe('203.0.113.195');
    });

    it('should fall back to connection.remoteAddress', async () => {
      const requestWithoutForwardedFor = {
        ...mockRequest,
        headers: {},
        connection: { remoteAddress: '192.168.1.100' },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockResolvedValue(mockUserResponseDto);

      await strategy.validate(
        requestWithoutForwardedFor as unknown as Request,
        mockPayload,
      );

      expect((requestWithoutForwardedFor as any).ipAddress).toBe(
        '192.168.1.100',
      );
    });

    it('should fall back to socket.remoteAddress', async () => {
      const requestWithSocket = {
        ...mockRequest,
        headers: {},
        connection: {},
        socket: { remoteAddress: '10.0.0.1' },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockResolvedValue(mockUserResponseDto);

      await strategy.validate(
        requestWithSocket as unknown as Request,
        mockPayload,
      );

      expect((requestWithSocket as any).ipAddress).toBe('10.0.0.1');
    });

    it('should return empty string when no IP is available', async () => {
      const requestWithoutIp = {
        ...mockRequest,
        headers: {},
        connection: {},
        socket: {},
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);
      userService.getUserById.mockResolvedValue(mockUserResponseDto);

      await strategy.validate(
        requestWithoutIp as unknown as Request,
        mockPayload,
      );

      expect((requestWithoutIp as any).ipAddress).toBe('');
    });
  });
});
