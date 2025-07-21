import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VerifyCallback } from 'passport-google-oauth20';

import { GoogleStrategy } from './google.strategy';
import { AuthService } from '../auth.service';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    provider: 'google',
  };

  const mockGoogleProfile = {
    id: 'google-123456789',
    name: {
      givenName: 'John',
      familyName: 'Doe',
    },
    emails: [
      {
        value: 'test@example.com',
        verified: true,
      },
    ],
    photos: [
      {
        value: 'https://lh3.googleusercontent.com/photo.jpg',
      },
    ],
    provider: 'google',
  };

  const mockDoneCallback = jest.fn() as jest.MockedFunction<VerifyCallback>;

  beforeEach(async () => {
    // Mock config service with proper OAuth credentials
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        const configs = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
        };
        return configs[key];
      }),
    } as any;

    authService = {
      validateOAuthUser: jest.fn(),
    } as any;

    // Create strategy instance directly
    strategy = new GoogleStrategy(configService, authService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    const accessToken = 'google-access-token';
    const refreshToken = 'google-refresh-token';

    it('should validate Google OAuth profile successfully', async () => {
      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        mockGoogleProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        {
          id: mockGoogleProfile.id,
          provider: 'google',
          email: mockGoogleProfile.emails[0].value,
          firstName: mockGoogleProfile.name.givenName,
          lastName: mockGoogleProfile.name.familyName,
          profilePictureUrl: mockGoogleProfile.photos[0].value,
          accessToken,
          refreshToken,
        },
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle missing profile data gracefully', async () => {
      const incompleteProfile = {
        id: 'google-123456789',
        name: {
          givenName: 'John',
        },
        emails: [],
        photos: [],
        provider: 'google',
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        incompleteProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        {
          id: incompleteProfile.id,
          provider: 'google',
          email: undefined,
          firstName: incompleteProfile.name.givenName,
          lastName: undefined,
          profilePictureUrl: undefined,
          accessToken,
          refreshToken,
        },
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle undefined profile', async () => {
      await strategy.validate(
        accessToken,
        refreshToken,
        undefined,
        mockDoneCallback,
      );

      expect(mockDoneCallback).toHaveBeenCalledWith(
        new TypeError('Profile is undefined'),
        undefined,
      );
      expect(authService.validateOAuthUser).not.toHaveBeenCalled();
    });

    it('should handle null profile', async () => {
      await strategy.validate(
        accessToken,
        refreshToken,
        null,
        mockDoneCallback,
      );

      expect(mockDoneCallback).toHaveBeenCalledWith(
        new TypeError('Profile is undefined'),
        undefined,
      );
      expect(authService.validateOAuthUser).not.toHaveBeenCalled();
    });

    it('should handle OAuth validation errors', async () => {
      const error = new Error('OAuth validation failed');
      authService.validateOAuthUser.mockRejectedValue(error);

      await strategy.validate(
        accessToken,
        refreshToken,
        mockGoogleProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        {
          id: mockGoogleProfile.id,
          provider: 'google',
          email: mockGoogleProfile.emails[0].value,
          firstName: mockGoogleProfile.name.givenName,
          lastName: mockGoogleProfile.name.familyName,
          profilePictureUrl: mockGoogleProfile.photos[0].value,
          accessToken,
          refreshToken,
        },
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(error, undefined);
    });

    it('should handle profile with multiple emails', async () => {
      const profileWithMultipleEmails = {
        ...mockGoogleProfile,
        emails: [
          { value: 'primary@example.com', verified: true },
          { value: 'secondary@example.com', verified: false },
        ],
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithMultipleEmails,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'primary@example.com', // Should use the first email
        }),
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle profile with multiple photos', async () => {
      const profileWithMultiplePhotos = {
        ...mockGoogleProfile,
        photos: [
          { value: 'https://lh3.googleusercontent.com/primary.jpg' },
          { value: 'https://lh3.googleusercontent.com/secondary.jpg' },
        ],
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithMultiplePhotos,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          profilePictureUrl: 'https://lh3.googleusercontent.com/primary.jpg', // Should use the first photo
        }),
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle profile without name object', async () => {
      const profileWithoutName = {
        ...mockGoogleProfile,
        name: undefined,
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithoutName,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: undefined,
          lastName: undefined,
        }),
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle empty refresh token', async () => {
      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        '',
        mockGoogleProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: '',
        }),
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle null refresh token', async () => {
      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        null as any,
        mockGoogleProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: null,
        }),
        'google',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });
  });

  describe('constructor', () => {
    it('should configure strategy with correct options', () => {
      expect(configService.getOrThrow).toHaveBeenCalledWith('GOOGLE_CLIENT_ID');
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'GOOGLE_CLIENT_SECRET',
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'GOOGLE_CALLBACK_URL',
      );
    });
  });
});
