import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { UserRole } from '../database/entities/user.entity';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
  RefreshTokenDto,
  CreateCounselorProfileDto,
} from './dto/auth.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let userService: jest.Mocked<UserService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    isActive: true,
    isVerified: true,
    timezone: 'UTC',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockLoginResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenType: 'Bearer',
    expiresIn: 86400,
    user: mockUser,
  };

  const mockRequest = {
    user: {
      sub: mockUser.id,
      sessionId: 'session-id',
    },
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'Mozilla/5.0',
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            logout: jest.fn(),
            logoutAll: jest.fn(),
            refreshToken: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            changePassword: jest.fn(),
            handleOAuthCallback: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            verifyEmail: jest.fn(),
            resendVerificationEmail: jest.fn(),
            getUserById: jest.fn(),
            updateProfile: jest.fn(),
            deleteAccount: jest.fn(),
            getUserSessions: jest.fn(),
            revokeSession: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.USER,
    };

    it('should register a new user successfully', async () => {
      authService.register.mockResolvedValue(mockLoginResponse);

      const result = await controller.register(
        registerDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(authService.register).toHaveBeenCalledWith(
        registerDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );
      expect(result).toEqual({
        success: true,
        message: 'User registered successfully',
        data: mockLoginResponse,
        timestamp: expect.any(String),
      });
    });

    it('should handle registration errors', async () => {
      const error = new Error('User already exists');
      authService.register.mockRejectedValue(error);

      await expect(
        controller.register(registerDto, '127.0.0.1', 'Mozilla/5.0'),
      ).rejects.toThrow(error);
      expect(authService.register).toHaveBeenCalledWith(
        registerDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    it('should login user successfully', async () => {
      authService.login.mockResolvedValue(mockLoginResponse);

      const result = await controller.login(
        loginDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );
      expect(result).toEqual({
        success: true,
        message: 'Login successful',
        data: mockLoginResponse,
        timestamp: expect.any(String),
      });
    });

    it('should handle login errors', async () => {
      const error = new Error('Invalid credentials');
      authService.login.mockRejectedValue(error);

      await expect(
        controller.login(loginDto, '127.0.0.1', 'Mozilla/5.0'),
      ).rejects.toThrow(error);
      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      authService.logout.mockResolvedValue(undefined);

      // Fix: Pass sessionId as string, not as request object
      const result = await controller.logout('session-id');

      expect(authService.logout).toHaveBeenCalledWith('session-id');
      expect(result).toEqual({
        success: true,
        message: 'Logout successful',
        timestamp: expect.any(String),
      });
    });

    it('should handle logout errors', async () => {
      const error = new Error('Session not found');
      authService.logout.mockRejectedValue(error);

      await expect(controller.logout('session-id')).rejects.toThrow(error);
      expect(authService.logout).toHaveBeenCalledWith('session-id');
    });
  });

  describe('logoutAll', () => {
    it('should logout from all devices successfully', async () => {
      authService.logoutAll.mockResolvedValue(undefined);

      // Fix: Pass userId as string, not as request object
      const result = await controller.logoutAll(mockUser.id);

      expect(authService.logoutAll).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({
        success: true,
        message: 'Logged out from all devices',
        timestamp: expect.any(String),
      });
    });

    it('should handle logoutAll errors', async () => {
      const error = new Error('User not found');
      authService.logoutAll.mockRejectedValue(error);

      await expect(controller.logoutAll(mockUser.id)).rejects.toThrow(error);
      expect(authService.logoutAll).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto: RefreshTokenDto = {
      refreshToken: 'refresh-token',
    };

    it('should refresh token successfully', async () => {
      authService.refreshToken.mockResolvedValue(mockLoginResponse);

      const result = await controller.refreshToken(
        refreshTokenDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(authService.refreshToken).toHaveBeenCalledWith(
        'refresh-token',
        '127.0.0.1',
        'Mozilla/5.0',
      );
      expect(result).toEqual({
        success: true,
        message: 'Token refreshed successfully',
        data: mockLoginResponse,
        timestamp: expect.any(String),
      });
    });

    it('should handle refresh token errors', async () => {
      const error = new Error('Invalid refresh token');
      authService.refreshToken.mockRejectedValue(error);

      await expect(
        controller.refreshToken(refreshTokenDto, '127.0.0.1', 'Mozilla/5.0'),
      ).rejects.toThrow(error);
      expect(authService.refreshToken).toHaveBeenCalledWith(
        'refresh-token',
        '127.0.0.1',
        'Mozilla/5.0',
      );
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
    };

    it('should send password reset email successfully', async () => {
      authService.forgotPassword.mockResolvedValue(undefined);

      const result = await controller.forgotPassword(forgotPasswordDto);

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
      );
      expect(result).toEqual({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        timestamp: expect.any(String),
      });
    });

    it('should handle forgot password errors', async () => {
      const error = new Error('Email service unavailable');
      authService.forgotPassword.mockRejectedValue(error);

      await expect(
        controller.forgotPassword(forgotPasswordDto),
      ).rejects.toThrow(error);
      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
      );
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto: ResetPasswordDto = {
      token: 'reset-token',
      password: 'NewSecurePassword123!',
    };

    it('should reset password successfully', async () => {
      authService.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword(resetPasswordDto);

      expect(authService.resetPassword).toHaveBeenCalledWith(resetPasswordDto);
      expect(result).toEqual({
        success: true,
        message: 'Password reset successfully',
        timestamp: expect.any(String),
      });
    });

    it('should handle reset password errors', async () => {
      const error = new Error('Invalid or expired token');
      authService.resetPassword.mockRejectedValue(error);

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        error,
      );
      expect(authService.resetPassword).toHaveBeenCalledWith(resetPasswordDto);
    });
  });

  describe('changePassword', () => {
    const changePasswordDto: ChangePasswordDto = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    };

    it('should change password successfully', async () => {
      authService.changePassword.mockResolvedValue(undefined);

      // Fix: Pass userId as string and DTO separately
      const result = await controller.changePassword(
        changePasswordDto,
        mockUser.id,
      );

      expect(authService.changePassword).toHaveBeenCalledWith(
        mockUser.id,
        changePasswordDto,
      );
      expect(result).toEqual({
        success: true,
        message: 'Password changed successfully',
        timestamp: expect.any(String),
      });
    });

    it('should handle change password errors', async () => {
      const error = new Error('Current password is incorrect');
      authService.changePassword.mockRejectedValue(error);

      await expect(
        controller.changePassword(changePasswordDto, mockUser.id),
      ).rejects.toThrow(error);
      expect(authService.changePassword).toHaveBeenCalledWith(
        mockUser.id,
        changePasswordDto,
      );
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailDto: VerifyEmailDto = {
      token: 'verification-token',
    };

    it('should verify email successfully', async () => {
      userService.verifyEmail.mockResolvedValue(undefined);

      const result = await controller.verifyEmail(verifyEmailDto);

      expect(userService.verifyEmail).toHaveBeenCalledWith(
        'verification-token',
      );
      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully',
        timestamp: expect.any(String),
      });
    });

    it('should handle email verification errors', async () => {
      const error = new Error('Invalid verification token');
      userService.verifyEmail.mockRejectedValue(error);

      await expect(controller.verifyEmail(verifyEmailDto)).rejects.toThrow(
        error,
      );
      expect(userService.verifyEmail).toHaveBeenCalledWith(
        'verification-token',
      );
    });
  });

  describe('resendVerification', () => {
    it('should resend verification email successfully', async () => {
      userService.resendVerificationEmail.mockResolvedValue(undefined);

      // Fix: Pass userId as string
      const result = await controller.resendVerification(mockUser.id);

      expect(userService.resendVerificationEmail).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(result).toEqual({
        success: true,
        message: 'Verification email sent',
        timestamp: expect.any(String),
      });
    });

    it('should handle resend verification errors', async () => {
      const error = new Error('Email already verified');
      userService.resendVerificationEmail.mockRejectedValue(error);

      await expect(controller.resendVerification(mockUser.id)).rejects.toThrow(
        error,
      );
      expect(userService.resendVerificationEmail).toHaveBeenCalledWith(
        mockUser.id,
      );
    });
  });

  describe('OAuth endpoints', () => {
    describe('googleAuth', () => {
      it('should handle Google OAuth initiation', async () => {
        // This endpoint is handled by GoogleAuthGuard
        await controller.googleAuth();
        // No assertions needed as it's handled by the guard
      });
    });

    describe('googleAuthCallback', () => {
      const mockOAuthUser = {
        id: 'google-123',
        provider: 'google',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      it('should handle Google OAuth callback successfully', async () => {
        const requestWithOAuthUser = { ...mockRequest, user: mockOAuthUser };
        authService.handleOAuthCallback.mockResolvedValue(mockLoginResponse);

        const result = await controller.googleAuthCallback(
          requestWithOAuthUser,
          '127.0.0.1',
          'Mozilla/5.0',
        );

        expect(authService.handleOAuthCallback).toHaveBeenCalledWith(
          mockOAuthUser,
          'google',
          '127.0.0.1',
          'Mozilla/5.0',
        );
        expect(result).toEqual({
          success: true,
          message: 'Google authentication successful',
          data: mockLoginResponse,
          timestamp: expect.any(String),
        });
      });

      it('should handle Google OAuth callback errors', async () => {
        const requestWithOAuthUser = { ...mockRequest, user: mockOAuthUser };
        const error = new Error('OAuth validation failed');
        authService.handleOAuthCallback.mockRejectedValue(error);

        await expect(
          controller.googleAuthCallback(
            requestWithOAuthUser,
            '127.0.0.1',
            'Mozilla/5.0',
          ),
        ).rejects.toThrow(error);
        expect(authService.handleOAuthCallback).toHaveBeenCalledWith(
          mockOAuthUser,
          'google',
          '127.0.0.1',
          'Mozilla/5.0',
        );
      });
    });

    describe('facebookAuth', () => {
      it('should handle Facebook OAuth initiation', async () => {
        // This endpoint is handled by FacebookAuthGuard
        await controller.facebookAuth();
        // No assertions needed as it's handled by the guard
      });
    });

    describe('facebookAuthCallback', () => {
      const mockOAuthUser = {
        id: 'facebook-123',
        provider: 'facebook',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      it('should handle Facebook OAuth callback successfully', async () => {
        const requestWithOAuthUser = { ...mockRequest, user: mockOAuthUser };
        authService.handleOAuthCallback.mockResolvedValue(mockLoginResponse);

        const result = await controller.facebookAuthCallback(
          requestWithOAuthUser,
          '127.0.0.1',
          'Mozilla/5.0',
        );

        expect(authService.handleOAuthCallback).toHaveBeenCalledWith(
          mockOAuthUser,
          'facebook',
          '127.0.0.1',
          'Mozilla/5.0',
        );
        expect(result).toEqual({
          success: true,
          message: 'Facebook authentication successful',
          data: mockLoginResponse,
          timestamp: expect.any(String),
        });
      });

      it('should handle Facebook OAuth callback errors', async () => {
        const requestWithOAuthUser = { ...mockRequest, user: mockOAuthUser };
        const error = new Error('OAuth validation failed');
        authService.handleOAuthCallback.mockRejectedValue(error);

        await expect(
          controller.facebookAuthCallback(
            requestWithOAuthUser,
            '127.0.0.1',
            'Mozilla/5.0',
          ),
        ).rejects.toThrow(error);
        expect(authService.handleOAuthCallback).toHaveBeenCalledWith(
          mockOAuthUser,
          'facebook',
          '127.0.0.1',
          'Mozilla/5.0',
        );
      });
    });
  });
});
