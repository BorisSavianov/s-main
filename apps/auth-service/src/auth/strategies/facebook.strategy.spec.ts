import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VerifyCallback } from 'passport-facebook';

import { FacebookStrategy } from './facebook.strategy';
import { AuthService } from '../auth.service';

describe('FacebookStrategy', () => {
  let strategy: FacebookStrategy;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    provider: 'facebook',
  };

  const mockFacebookProfile = {
    id: 'facebook-123456789',
    name: {
      givenName: 'John',
      familyName: 'Doe',
    },
    emails: [
      {
        value: 'test@example.com',
      },
    ],
    photos: [
      {
        value: 'https://graph.facebook.com/123456789/picture?type=large',
      },
    ],
    provider: 'facebook',
  };

  const mockDoneCallback = jest.fn() as jest.MockedFunction<VerifyCallback>;

  beforeEach(async () => {
    // Mock config service with proper OAuth credentials
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const configs = {
          FACEBOOK_CLIENT_ID: 'test-client-id',
          FACEBOOK_CLIENT_SECRET: 'test-client-secret',
          FACEBOOK_CALLBACK_URL: 'http://localhost:3000/auth/facebook/callback',
        };
        return configs[key];
      }),
    } as any;

    authService = {
      validateOAuthUser: jest.fn(),
    } as any;

    // Create strategy instance directly
    strategy = new FacebookStrategy(configService, authService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    const accessToken = 'facebook-access-token';
    const refreshToken = 'facebook-refresh-token';

    it('should validate Facebook OAuth profile successfully', async () => {
      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        mockFacebookProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        {
          id: mockFacebookProfile.id,
          provider: 'facebook',
          email: mockFacebookProfile.emails[0].value,
          firstName: mockFacebookProfile.name.givenName,
          lastName: mockFacebookProfile.name.familyName,
          profilePictureUrl: mockFacebookProfile.photos[0].value,
          accessToken,
          refreshToken,
        },
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle missing profile data gracefully', async () => {
      const incompleteProfile = {
        id: 'facebook-123456789',
        name: {
          givenName: 'John',
        },
        emails: [],
        photos: [],
        provider: 'facebook',
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
          provider: 'facebook',
          email: undefined,
          firstName: incompleteProfile.name.givenName,
          lastName: undefined,
          profilePictureUrl: undefined,
          accessToken,
          refreshToken,
        },
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle OAuth validation errors', async () => {
      const error = new Error('OAuth validation failed');
      authService.validateOAuthUser.mockRejectedValue(error);

      await strategy.validate(
        accessToken,
        refreshToken,
        mockFacebookProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        {
          id: mockFacebookProfile.id,
          provider: 'facebook',
          email: mockFacebookProfile.emails[0].value,
          firstName: mockFacebookProfile.name.givenName,
          lastName: mockFacebookProfile.name.familyName,
          profilePictureUrl: mockFacebookProfile.photos[0].value,
          accessToken,
          refreshToken,
        },
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(error, null);
    });

    it('should handle profile with multiple emails', async () => {
      const profileWithMultipleEmails = {
        ...mockFacebookProfile,
        emails: [
          { value: 'primary@example.com' },
          { value: 'secondary@example.com' },
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
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle profile with multiple photos', async () => {
      const profileWithMultiplePhotos = {
        ...mockFacebookProfile,
        photos: [
          { value: 'https://graph.facebook.com/123456789/picture?type=large' },
          { value: 'https://graph.facebook.com/123456789/picture?type=small' },
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
          profilePictureUrl:
            'https://graph.facebook.com/123456789/picture?type=large', // Should use the first photo
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle profile without name object', async () => {
      const profileWithoutName = {
        ...mockFacebookProfile,
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
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle empty refresh token', async () => {
      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        '',
        mockFacebookProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: '',
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle null refresh token', async () => {
      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        null as any,
        mockFacebookProfile,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: null,
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle missing emails array', async () => {
      const profileWithoutEmails = {
        ...mockFacebookProfile,
        emails: undefined,
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithoutEmails,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: undefined,
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle missing photos array', async () => {
      const profileWithoutPhotos = {
        ...mockFacebookProfile,
        photos: undefined,
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithoutPhotos,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          profilePictureUrl: undefined,
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle profile with empty name components', async () => {
      const profileWithEmptyName = {
        ...mockFacebookProfile,
        name: {
          givenName: '',
          familyName: '',
        },
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithEmptyName,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: '',
          lastName: '',
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should handle profile with partial name', async () => {
      const profileWithPartialName = {
        ...mockFacebookProfile,
        name: {
          givenName: 'John',
          // missing familyName
        },
      };

      authService.validateOAuthUser.mockResolvedValue(mockUser as any);

      await strategy.validate(
        accessToken,
        refreshToken,
        profileWithPartialName,
        mockDoneCallback,
      );

      expect(authService.validateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'John',
          lastName: undefined,
        }),
        'facebook',
      );
      expect(mockDoneCallback).toHaveBeenCalledWith(null, mockUser);
    });
  });

  describe('constructor', () => {
    it('should configure strategy with correct options', () => {
      expect(configService.get).toHaveBeenCalledWith('FACEBOOK_CLIENT_ID');
      expect(configService.get).toHaveBeenCalledWith('FACEBOOK_CLIENT_SECRET');
      expect(configService.get).toHaveBeenCalledWith('FACEBOOK_CALLBACK_URL');
    });
  });
});
