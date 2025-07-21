import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

import { LocalStrategy } from './local.strategy';
import { AuthService } from '../auth.service';
import { UserService } from '../user.service';
import { User, UserRole } from '../../database/entities/user.entity';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: jest.Mocked<AuthService>;
  let userService: jest.Mocked<UserService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
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

  const mockRequest = {
    headers: {
      'x-forwarded-for': '192.168.1.1',
    },
    connection: {
      remoteAddress: '127.0.0.1',
    },
    socket: {
      remoteAddress: '10.0.0.1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            resetLoginAttempts: jest.fn(),
            getUserByEmail: jest.fn(),
            incrementLoginAttempts: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<LocalStrategy>(LocalStrategy);
    authService = module.get(AuthService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate user credentials successfully', async () => {
      authService.validateUser.mockResolvedValue(mockUser);
      userService.resetLoginAttempts.mockResolvedValue(undefined);

      const result = await strategy.validate(
        mockRequest,
        'test@example.com',
        'password123',
      );

      expect(authService.validateUser).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
      expect(userService.resetLoginAttempts).toHaveBeenCalledWith(mockUser.id);
      expect(result).toBe(mockUser);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      authService.validateUser.mockResolvedValue(null);
      userService.getUserByEmail.mockResolvedValue(mockUser);
      userService.incrementLoginAttempts.mockResolvedValue(undefined);

      await expect(
        strategy.validate(mockRequest, 'test@example.com', 'wrongpassword'),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      expect(authService.validateUser).toHaveBeenCalledWith(
        'test@example.com',
        'wrongpassword',
      );
      expect(userService.getUserByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(userService.incrementLoginAttempts).toHaveBeenCalledWith(
        mockUser.id,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      authService.validateUser.mockResolvedValue(inactiveUser);
      userService.getUserByEmail.mockResolvedValue(inactiveUser);
      userService.incrementLoginAttempts.mockResolvedValue(undefined);

      await expect(
        strategy.validate(mockRequest, 'test@example.com', 'password123'),
      ).rejects.toThrow(new UnauthorizedException('Account deactivated'));

      expect(authService.validateUser).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
      expect(userService.getUserByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(userService.incrementLoginAttempts).toHaveBeenCalledWith(
        inactiveUser.id,
      );
    });

    it('should increment login attempts for any validation error', async () => {
      const error = new Error('Database error');
      authService.validateUser.mockRejectedValue(error);
      userService.getUserByEmail.mockResolvedValue(mockUser);
      userService.incrementLoginAttempts.mockResolvedValue(undefined);

      await expect(
        strategy.validate(mockRequest, 'test@example.com', 'password123'),
      ).rejects.toThrow(error);

      expect(authService.validateUser).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
      expect(userService.getUserByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(userService.incrementLoginAttempts).toHaveBeenCalledWith(
        mockUser.id,
      );
    });

    it('should not increment login attempts if user not found', async () => {
      authService.validateUser.mockResolvedValue(null);
      userService.getUserByEmail.mockResolvedValue(null);

      await expect(
        strategy.validate(
          mockRequest,
          'nonexistent@example.com',
          'password123',
        ),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      expect(authService.validateUser).toHaveBeenCalledWith(
        'nonexistent@example.com',
        'password123',
      );
      expect(userService.getUserByEmail).toHaveBeenCalledWith(
        'nonexistent@example.com',
      );
      expect(userService.incrementLoginAttempts).not.toHaveBeenCalled();
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
        connection: {},
        socket: {},
      };

      const ip = (strategy as any).getClientIp(request);
      expect(ip).toBe('203.0.113.195');
    });

    it('should fall back to connection.remoteAddress', () => {
      const request = {
        headers: {},
        connection: {
          remoteAddress: '192.168.1.100',
        },
        socket: {},
      };

      const ip = (strategy as any).getClientIp(request);
      expect(ip).toBe('192.168.1.100');
    });

    it('should fall back to socket.remoteAddress', () => {
      const request = {
        headers: {},
        connection: {},
        socket: {
          remoteAddress: '10.0.0.1',
        },
      };

      const ip = (strategy as any).getClientIp(request);
      expect(ip).toBe('10.0.0.1');
    });

    it('should return empty string when no IP is available', () => {
      const request = {
        headers: {},
        connection: {},
        socket: {},
      };

      const ip = (strategy as any).getClientIp(request);
      expect(ip).toBe('');
    });

    it('should handle undefined headers', () => {
      const request = {
        headers: undefined,
        connection: {
          remoteAddress: '127.0.0.1',
        },
        socket: {},
      };

      const ip = (strategy as any).getClientIp(request);
      expect(ip).toBe('127.0.0.1');
    });

    it('should handle x-forwarded-for without comma', () => {
      const request = {
        headers: {
          'x-forwarded-for': '203.0.113.195',
        },
        connection: {},
        socket: {},
      };

      const ip = (strategy as any).getClientIp(request);
      expect(ip).toBe('203.0.113.195');
    });
  });
});
