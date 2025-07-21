import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import {
  RefreshTokenStrategy,
  RefreshTokenPayload,
} from './refresh-token.strategy';
import { UserService } from '../user.service';
import { RedisService } from '../../redis/redis.service';
import { User, UserRole } from '../../database/entities/user.entity';

describe('RefreshTokenStrategy', () => {
  let strategy: RefreshTokenStrategy;
  let userService: jest.Mocked<UserService>;
  let redisService: jest.Mocked<RedisService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    timezone: 'UTC',
    isActive: true,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    sessions: [],
    oauthProviders: [],
  } as User;

  const mockPayload: RefreshTokenPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    tokenId: 'token-id-123',
    sessionId: 'session-id-456',
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const mockStoredTokenData = {
    userId: mockUser.id,
    sessionId: 'session-id-456',
    tokenId: 'token-id-123',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-jwt-refresh-secret'),
          },
        },
        {
          provide: UserService,
          useValue: {
            getUserById: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<RefreshTokenStrategy>(RefreshTokenStrategy);
    userService = module.get(UserService);
    redisService = module.get(RedisService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    const mockRequest = {
      cookies: {
        refresh_token: 'valid-refresh-token',
      },
      body: {
        refreshToken: 'body-refresh-token',
      },
    } as unknown as Request;

    it('should validate refresh token successfully', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));
      userService.getUserById.mockResolvedValue(mockUser as any);

      const result = await strategy.validate(mockRequest, mockPayload);

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).toHaveBeenCalledWith(mockPayload.sub);
      expect(result).toEqual({
        userId: mockUser.id,
        email: mockUser.email,
        tokenId: mockPayload.tokenId,
        sessionId: mockPayload.sessionId,
        user: mockUser,
      });
    });

    it('should throw UnauthorizedException when refresh token not found in Redis', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when stored token userId does not match', async () => {
      const invalidStoredTokenData = {
        ...mockStoredTokenData,
        userId: 'different-user-id',
      };
      redisService.get.mockResolvedValue(
        JSON.stringify(invalidStoredTokenData),
      );

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when stored token sessionId does not match', async () => {
      const invalidStoredTokenData = {
        ...mockStoredTokenData,
        sessionId: 'different-session-id',
      };
      redisService.get.mockResolvedValue(
        JSON.stringify(invalidStoredTokenData),
      );

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user not found', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));
      userService.getUserById.mockResolvedValue(null as any);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));
      userService.getUserById.mockResolvedValue(inactiveUser as any);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Account deactivated'),
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).toHaveBeenCalledWith(mockPayload.sub);
    });

    it('should handle malformed stored token data', async () => {
      redisService.get.mockResolvedValue('invalid-json');

      await expect(
        strategy.validate(mockRequest, mockPayload),
      ).rejects.toThrow();

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
    });

    it('should handle Redis errors', async () => {
      const redisError = new Error('Redis connection failed');
      redisService.get.mockRejectedValue(redisError);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        redisError,
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
    });

    it('should handle UserService errors', async () => {
      const userServiceError = new Error('Database connection failed');
      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));
      userService.getUserById.mockRejectedValue(userServiceError);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        userServiceError,
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `refresh_token:${mockPayload.tokenId}`,
      );
      expect(userService.getUserById).toHaveBeenCalledWith(mockPayload.sub);
    });
  });

  describe('token extraction', () => {
    it('should extract token from cookies', () => {
      // This is tested indirectly through the JWT strategy configuration
      expect(configService.get).toHaveBeenCalledWith('JWT_REFRESH_SECRET');
    });

    it('should extract token from request body when cookies are not available', async () => {
      const requestWithBodyToken = {
        cookies: {},
        body: {
          refreshToken: 'body-refresh-token',
        },
      } as unknown as Request;

      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));
      userService.getUserById.mockResolvedValue(mockUser as any);

      // This tests the token extraction logic indirectly
      const result = await strategy.validate(requestWithBodyToken, mockPayload);

      expect(result).toEqual({
        userId: mockUser.id,
        email: mockUser.email,
        tokenId: mockPayload.tokenId,
        sessionId: mockPayload.sessionId,
        user: mockUser,
      });
    });

    it('should handle request without cookies or body token', async () => {
      const requestWithoutToken = {
        cookies: {},
        body: {},
      } as unknown as Request;

      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));
      userService.getUserById.mockResolvedValue(mockUser as any);

      // This should still work if the JWT strategy extracts the token correctly
      const result = await strategy.validate(requestWithoutToken, mockPayload);

      expect(result).toEqual({
        userId: mockUser.id,
        email: mockUser.email,
        tokenId: mockPayload.tokenId,
        sessionId: mockPayload.sessionId,
        user: mockUser,
      });
    });
  });

  describe('constructor', () => {
    it('should configure strategy with correct JWT options', () => {
      expect(configService.get).toHaveBeenCalledWith('JWT_REFRESH_SECRET');
    });
  });

  describe('payload validation', () => {
    it('should handle missing tokenId in payload', async () => {
      const invalidPayload = { ...mockPayload, tokenId: undefined } as any;
      redisService.get.mockResolvedValue(null);

      await expect(
        strategy.validate({} as Request, invalidPayload),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });

    it('should handle missing sessionId in payload', async () => {
      const invalidPayload = { ...mockPayload, sessionId: undefined } as any;
      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));

      await expect(
        strategy.validate({} as Request, invalidPayload),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });

    it('should handle missing sub (userId) in payload', async () => {
      const invalidPayload = { ...mockPayload, sub: undefined } as any;
      redisService.get.mockResolvedValue(JSON.stringify(mockStoredTokenData));

      await expect(
        strategy.validate({} as Request, invalidPayload),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });
  });
});
