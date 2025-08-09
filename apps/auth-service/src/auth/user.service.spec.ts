import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { UserService } from './user.service';
import { User, UserRole } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';
import { RedisService } from '../redis/redis.service';
import { SessionService } from './session.service';
import { NotificationServiceClient } from 'apps/notification-service/src/clients/notification-service.client';

const mockNotificationServiceClient = {
  sendVerificationEmail: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let sessionRepository: jest.Mocked<Repository<UserSession>>;
  let counselorProfileRepository: jest.Mocked<Repository<CounselorProfile>>;
  let redisService: jest.Mocked<RedisService>;
  let sessionService: jest.Mocked<SessionService>;

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

  const mockCounselorProfile = {
    id: '456e7890-e89b-12d3-a456-426614174001',
    userId: mockUser.id,
    licenseNumber: 'LIC123456',
    specialties: ['Anxiety', 'Depression'],
    qualifications: ['PhD in Clinical Psychology'],
    experienceYears: 5,
    bio: 'Experienced counselor',
    hourlyRate: 100,
    languages: ['English'],
    isAvailable: true,
    rating: 0,
    totalReviews: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: mockUser,
  } as CounselorProfile;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
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
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            invalidateUserCache: jest.fn(),
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
          provide: NotificationServiceClient,
          useValue: mockNotificationServiceClient,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get(getRepositoryToken(User));
    sessionRepository = module.get(getRepositoryToken(UserSession));
    counselorProfileRepository = module.get(
      getRepositoryToken(CounselorProfile),
    );
    redisService = module.get(RedisService);
    sessionService = module.get(SessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should return user data successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserById(mockUser.id);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        relations: ['counselorProfile'],
      });
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        phone: mockUser.phone,
        dateOfBirth: undefined,
        gender: mockUser.gender,
        timezone: mockUser.timezone,
        profilePictureUrl: mockUser.profilePictureUrl,
        isActive: mockUser.isActive,
        isVerified: mockUser.isVerified,
        lastLogin: undefined,
        createdAt: mockUser.createdAt.toISOString(),
        updatedAt: mockUser.updatedAt.toISOString(),
        counselorProfile: undefined,
      });
    });

    it('should throw NotFoundException when user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'nonexistent-id' },
        relations: ['counselorProfile'],
      });
    });
  });

  describe('getUserByEmail', () => {
    it('should return user data successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserByEmail(mockUser.email);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: mockUser.email },
        relations: ['counselorProfile'],
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.getUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    const updateProfileDto = {
      firstName: 'Updated John',
      lastName: 'Updated Doe',
    };

    it('should update user profile successfully', async () => {
      const updatedUser = { ...mockUser, ...updateProfileDto };
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(mockUser.id, updateProfileDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        relations: ['counselorProfile'],
      });
      expect(userRepository.save).toHaveBeenCalledWith(updatedUser);
      expect(result).toEqual(
        expect.objectContaining({
          id: mockUser.id,
          firstName: updateProfileDto.firstName,
          lastName: updateProfileDto.lastName,
        }),
      );
    });

    it('should throw NotFoundException when user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile('nonexistent-id', updateProfileDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // describe('createCounselorProfile', () => {
  //   const createCounselorDto = {
  //     licenseNumber: 'LIC123456',
  //     specialties: ['Anxiety', 'Depression'],
  //     qualifications: ['PhD in Clinical Psychology'],
  //     experienceYears: 5,
  //     bio: 'Experienced counselor',
  //     hourlyRate: 100,
  //     languages: ['English'],
  //   };

  //   it('should create counselor profile successfully', async () => {
  //     const counselorUser = { ...mockUser, role: UserRole.COUNSELOR };
  //     userRepository.findOne.mockResolvedValue(counselorUser);
  //     counselorProfileRepository.findOne.mockResolvedValue(null);
  //     counselorProfileRepository.create.mockReturnValue(mockCounselorProfile);
  //     counselorProfileRepository.save.mockResolvedValue(mockCounselorProfile);

  //     const result = await service.createCounselorProfile(
  //       mockUser.id,
  //       createCounselorDto,
  //     );

  //     expect(userRepository.findOne).toHaveBeenCalledWith({
  //       where: { id: mockUser.id },
  //       relations: ['counselorProfile'],
  //     });
  //     expect(counselorProfileRepository.findOne).toHaveBeenCalledWith({
  //       where: { licenseNumber: createCounselorDto.licenseNumber },
  //     });
  //     expect(counselorProfileRepository.create).toHaveBeenCalledWith({
  //       ...createCounselorDto,
  //       userId: mockUser.id,
  //     });
  //     expect(counselorProfileRepository.save).toHaveBeenCalledWith(
  //       mockCounselorProfile,
  //     );
  //     expect(result).toEqual(
  //       expect.objectContaining({
  //         id: mockCounselorProfile.id,
  //         licenseNumber: mockCounselorProfile.licenseNumber,
  //         specialties: mockCounselorProfile.specialties,
  //       }),
  //     );
  //   });

  //   it('should throw NotFoundException when user is not found', async () => {
  //     userRepository.findOne.mockResolvedValue(null);

  //     await expect(
  //       service.createCounselorProfile('nonexistent-id', createCounselorDto),
  //     ).rejects.toThrow(NotFoundException);
  //   });

  //   it('should throw ForbiddenException when user is not a counselor', async () => {
  //     userRepository.findOne.mockResolvedValue(mockUser);

  //     await expect(
  //       service.createCounselorProfile(mockUser.id, createCounselorDto),
  //     ).rejects.toThrow(ForbiddenException);
  //   });

  //   it('should throw ConflictException when counselor profile already exists', async () => {
  //     const counselorUser = { ...mockUser, role: UserRole.COUNSELOR };
  //     userRepository.findOne.mockResolvedValue(counselorUser);
  //     counselorProfileRepository.findOne.mockResolvedValue(
  //       mockCounselorProfile,
  //     );

  //     await expect(
  //       service.createCounselorProfile(mockUser.id, createCounselorDto),
  //     ).rejects.toThrow(ConflictException);
  //   });
  // });

  describe('deactivateAccount', () => {
    it('should deactivate account successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue({ ...mockUser, isActive: false });
      sessionService.invalidateAllUserSessions.mockResolvedValue(undefined);

      const result = await service.deactivateAccount(mockUser.id);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(sessionService.invalidateAllUserSessions).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(userRepository.update).toHaveBeenCalledWith(mockUser.id, {
        isActive: false,
      });
      expect(result).toBeUndefined();
    });

    it('should throw NotFoundException when user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivateAccount('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
