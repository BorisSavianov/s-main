import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { User, UserRole } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { OAuthProvider } from '../database/entities/oauth-provider.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';
import { RedisService } from '../redis/redis.service';
import { PasswordService } from './password.service';
import { EmailService } from './email.service';
import { SessionService } from './session.service';
import { UserService } from './user.service';
import { NotificationServiceClient } from 'apps/notification-service/src/clients/notification-service.client';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let redisService: jest.Mocked<RedisService>;
  let passwordService: jest.Mocked<PasswordService>;
  let emailService: jest.Mocked<EmailService>;
  let sessionService: jest.Mocked<SessionService>;
  let userService: jest.Mocked<UserService>;

  const mockNotificationServiceClient = {
    sendVerificationEmail: jest.fn(),
  };

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    phone: undefined,
    dateOfBirth: undefined,
    gender: undefined,
    timezone: 'UTC',
    profilePictureUrl: undefined,
    isActive: true,
    isVerified: true,
    lastLogin: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: undefined,
    sessions: [],
    oauthProviders: [],
    counselorProfile: undefined,
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserSession),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OAuthProvider),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CounselorProfile),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            deleteSession: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hashPassword: jest.fn(),
            verifyPassword: jest.fn(),
            validatePasswordStrength: jest.fn(),
            generateRandomPassword: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
            sendPasswordChangedEmail: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn(),
            getSession: jest.fn(),
            invalidateSession: jest.fn(),
            invalidateAllUserSessions: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            getUserById: jest.fn(),
            getUserByEmail: jest.fn(),
            updateProfile: jest.fn(),
            verifyEmail: jest.fn(),
            getLoginAttempts: jest.fn(),
            incrementLoginAttempts: jest.fn(),
            resetLoginAttempts: jest.fn(),
            updateLastLogin: jest.fn(),
          },
        },
        {
          provide: NotificationServiceClient,
          useValue: mockNotificationServiceClient,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    redisService = module.get(RedisService);
    passwordService = module.get(PasswordService);
    emailService = module.get(EmailService);
    sessionService = module.get(SessionService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.USER,
    };

    it('should register a new user successfully', async () => {
      userRepository.findOne.mockResolvedValue(null);
      passwordService.hashPassword.mockResolvedValue('hashedPassword');
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      redisService.set.mockResolvedValue(undefined);
      emailService.sendVerificationEmail.mockResolvedValue(undefined);
      mockNotificationServiceClient.sendVerificationEmail.mockResolvedValue(undefined);
      sessionService.createSession.mockResolvedValue({
        id: 'session-id',
      } as any);
      jwtService.sign.mockReturnValue('access-token');
      configService.get.mockReturnValue('test-secret');
      userService.getUserById.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
      } as any);

      const result = await service.register(registerDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(passwordService.hashPassword).toHaveBeenCalledWith(
        registerDto.password,
      );
      expect(userRepository.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'access-token',
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    it('should login user successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userService.getLoginAttempts.mockResolvedValue(0);
      passwordService.verifyPassword.mockResolvedValue(true);
      userService.resetLoginAttempts.mockResolvedValue(undefined);
      userService.updateLastLogin.mockResolvedValue(undefined);
      sessionService.createSession.mockResolvedValue({
        id: 'session-id',
      } as any);
      jwtService.sign.mockReturnValue('access-token');
      configService.get.mockReturnValue('test-secret');
      userService.getUserById.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
      } as any);

      const result = await service.login(loginDto, '127.0.0.1', 'Mozilla/5.0');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: loginDto.email.toLowerCase().trim() },
        relations: ['counselorProfile'],
      });
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.passwordHash,
      );
      expect(sessionService.createSession).toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'access-token',
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
      });
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login(loginDto, '127.0.0.1', 'Mozilla/5.0'),
      ).rejects.toThrow(UnauthorizedException);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: loginDto.email.toLowerCase().trim() },
        relations: ['counselorProfile'],
      });
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userService.getLoginAttempts.mockResolvedValue(0);
      passwordService.verifyPassword.mockResolvedValue(false);
      userService.incrementLoginAttempts.mockResolvedValue(undefined);

      await expect(
        service.login(loginDto, '127.0.0.1', 'Mozilla/5.0'),
      ).rejects.toThrow(UnauthorizedException);
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.passwordHash,
      );
    });

    it('should throw ForbiddenException for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      userRepository.findOne.mockResolvedValue(inactiveUser);

      await expect(
        service.login(loginDto, '127.0.0.1', 'Mozilla/5.0'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      sessionService.invalidateSession.mockResolvedValue(undefined);
      redisService.deleteSession.mockResolvedValue(undefined);

      const result = await service.logout('session-id');

      expect(sessionService.invalidateSession).toHaveBeenCalledWith(
        'session-id',
      );
      expect(redisService.deleteSession).toHaveBeenCalledWith('session-id');
      expect(result).toBeUndefined();
    });
  });

  describe('validateUser', () => {
    it('should validate user successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        'password',
        mockUser.passwordHash,
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null for invalid credentials', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword',
      );

      expect(result).toBeNull();
    });
  });
});
