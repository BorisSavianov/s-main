// src/auth/auth.service.ts
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

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

import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
  CreateCounselorProfileDto,
  LoginResponseDto,
  UserResponseDto,
} from './dto/auth.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
  provider: 'google' | 'facebook';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectRepository(OAuthProvider)
    private readonly oauthProviderRepository: Repository<OAuthProvider>,
    @InjectRepository(CounselorProfile)
    private readonly counselorProfileRepository: Repository<CounselorProfile>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService,
    private readonly userService: UserService,
    private notificationClient: NotificationServiceClient,
  ) {}

  async register(
    registerDto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponseDto> {
    this.logger.log(`Registration attempt for email: ${registerDto.email}`);

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(
      registerDto.password,
    );

    // Create new user
    const user = this.userRepository.create({
      ...registerDto,
      passwordHash,
      email: registerDto.email.toLowerCase().trim(),
      role: registerDto.role || UserRole.USER,
      timezone: registerDto.timezone || 'UTC',
      isActive: true,
      isVerified: false,
    });

    const savedUser = await this.userRepository.save(user);

    // Create session and return tokens
    const loginResponse = await this.createUserSession(
      savedUser,
      ipAddress,
      userAgent,
    );

    await this.notificationClient.sendVerificationEmail(
      savedUser.email,
      loginResponse.accessToken,
    );

    this.logger.log(`User registered successfully: ${savedUser.id}`);
    return loginResponse;
  }

  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponseDto> {
    this.logger.log(`Login attempt for email: ${loginDto.email}`);

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email.toLowerCase().trim() },
      relations: ['counselorProfile'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    // Check login attempts
    const loginAttempts = await this.userService.getLoginAttempts(user.id);
    if (loginAttempts >= 5) {
      throw new UnauthorizedException(
        'Account temporarily locked due to too many failed attempts',
      );
    }

    // Verify password
    const isPasswordValid = await this.passwordService.verifyPassword(
      loginDto.password,
      user.passwordHash!,
    );

    if (!isPasswordValid) {
      // Increment login attempts
      await this.userService.incrementLoginAttempts(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset login attempts on successful login
    await this.userService.resetLoginAttempts(user.id);

    // Update last login
    await this.userService.updateLastLogin(user.id);

    // Create session and return tokens
    const loginResponse = await this.createUserSession(
      user,
      ipAddress,
      userAgent,
      loginDto.rememberMe,
    );

    try {
      await this.notificationClient.sendLoginAlertEmail(
        user.email,
        user.firstName!,
        ipAddress!,
        userAgent!,
        new Date(),
      );
    } catch (error) {
      // Don't fail login if notification fails
      this.logger.warn(`Failed to send login alert: ${error.message}`);
    }

    this.logger.log(`User logged in successfully: ${user.id}`);
    return loginResponse;
  }

  async logout(sessionId: string): Promise<void> {
    this.logger.log(`Logout attempt for session: ${sessionId}`);

    // Invalidate session in database
    await this.sessionService.invalidateSession(sessionId);

    // Remove session from Redis
    await this.redisService.deleteSession(sessionId);

    this.logger.log(`User logged out successfully: ${sessionId}`);
  }

  async logoutAll(userId: string): Promise<void> {
    this.logger.log(`Logout all sessions for user: ${userId}`);

    // Invalidate all user sessions
    await this.sessionService.invalidateAllUserSessions(userId);

    // Remove all user sessions from Redis
    await this.redisService.invalidatePattern(`session:*:${userId}`);

    this.logger.log(`All sessions logged out for user: ${userId}`);
  }

  async refreshToken(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponseDto> {
    try {
      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Get user and session
      const user = await this.userRepository.findOne({
        where: { id: decoded.sub },
        relations: ['counselorProfile'],
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify session exists and is active
      const session = await this.sessionService.getSession(decoded.sessionId);
      if (!session || !session.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Create new session
      const loginResponse = await this.createUserSession(
        user,
        ipAddress,
        userAgent,
      );

      // Invalidate old session
      await this.sessionService.invalidateSession(decoded.sessionId);

      return loginResponse;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: forgotPasswordDto.email.toLowerCase().trim() },
    });

    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Generate reset token
    const resetToken = uuidv4();
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Store reset token in Redis
    await this.redisService.set(
      `password_reset:${resetToken}`,
      user.id,
      3600, // 1 hour
    );

    // Send reset email
    await this.notificationClient.sendPasswordResetEmail(
      user.email,
      resetToken,
    );
    this.logger.log(`Password reset requested for user: ${user.id}`);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    // Get user ID from Redis
    const userId = await this.redisService.get(
      `password_reset:${resetPasswordDto.token}`,
    );

    if (!userId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash new password
    const passwordHash = await this.passwordService.hashPassword(
      resetPasswordDto.password,
    );

    // Update password
    await this.userRepository.update(user.id, { passwordHash });

    // Remove reset token
    await this.redisService.del(`password_reset:${resetPasswordDto.token}`);

    // Invalidate all user sessions
    await this.logoutAll(user.id);

    // Send password changed confirmation email
    await this.notificationClient.sendPasswordChangedEmail(
      user.email,
      user.firstName!,
    );

    this.logger.log(`Password reset successfully for user: ${user.id}`);
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await this.passwordService.verifyPassword(
      changePasswordDto.currentPassword,
      user.passwordHash!,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await this.passwordService.hashPassword(
      changePasswordDto.newPassword,
    );

    // Update password
    await this.userRepository.update(user.id, { passwordHash });

    // Send password changed notification
    await this.notificationClient.sendPasswordChangedEmail(
      user.email,
      user.firstName!,
    );

    this.logger.log(`Password changed successfully for user: ${user.id}`);
  }

  async handleOAuthCallback(
    profile: OAuthProfile,
    provider: 'google' | 'facebook',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponseDto> {
    this.logger.log(
      `OAuth callback for provider: ${provider}, email: ${profile.email}`,
    );

    // Check if user exists
    let user = await this.userRepository.findOne({
      where: { email: profile.email.toLowerCase().trim() },
      relations: ['counselorProfile'],
    });

    if (!user) {
      // Create new user
      user = this.userRepository.create({
        email: profile.email.toLowerCase().trim(),
        firstName: profile.firstName,
        lastName: profile.lastName,
        profilePictureUrl: profile.profilePictureUrl,
        role: UserRole.USER,
        timezone: 'UTC',
        isActive: true,
        isVerified: true, // OAuth users are considered verified
      });

      user = await this.userRepository.save(user);
    }

    // Check if OAuth provider exists
    let oauthProvider = await this.oauthProviderRepository.findOne({
      where: { userId: user.id, provider },
    });

    if (!oauthProvider) {
      // Create OAuth provider record
      oauthProvider = this.oauthProviderRepository.create({
        userId: user.id,
        provider,
        providerId: profile.id,
      });

      await this.oauthProviderRepository.save(oauthProvider);
    }

    // Update last login
    await this.userService.updateLastLogin(user.id);

    // Create session and return tokens
    const loginResponse = await this.createUserSession(
      user,
      ipAddress,
      userAgent,
    );

    this.logger.log(`OAuth login successful for user: ${user.id}`);
    return loginResponse;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      password,
      user.passwordHash!,
    );

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async validateJwtPayload(payload: JwtPayload): Promise<User | null> {
    // Check if session is still active
    const session = await this.sessionService.getSession(payload.sessionId);
    if (!session || !session.isActive) {
      return null;
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['counselorProfile'],
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }

  private async createUserSession(
    user: User,
    ipAddress?: string,
    userAgent?: string,
    rememberMe: boolean = false,
  ): Promise<LoginResponseDto> {
    // Create session
    const session = await this.sessionService.createSession(
      user,
      ipAddress,
      userAgent,
      rememberMe,
    );

    // Create JWT payload
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };

    // Generate tokens
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: rememberMe ? '30d' : '7d',
    });

    // Transform user for response
    const userResponse = await this.userService.getUserById(user.id);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.getTokenExpiresIn(),
      user: userResponse,
    };
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    // Generate verification token
    const verificationToken = uuidv4();

    // Store verification token in Redis (24 hours)
    await this.redisService.set(
      `email_verification:${verificationToken}`,
      user.id,
      86400, // 24 hours
    );

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );
  }

  private getTokenExpiresIn(): number {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');

    // Convert to seconds
    if (expiresIn.endsWith('s')) {
      return parseInt(expiresIn.slice(0, -1));
    } else if (expiresIn.endsWith('m')) {
      return parseInt(expiresIn.slice(0, -1)) * 60;
    } else if (expiresIn.endsWith('h')) {
      return parseInt(expiresIn.slice(0, -1)) * 60 * 60;
    } else if (expiresIn.endsWith('d')) {
      return parseInt(expiresIn.slice(0, -1)) * 60 * 60 * 24;
    }

    return 900; // 15 minutes default
  }

  async validateOAuthUser(
    profile: OAuthProfile,
    provider: 'google' | 'facebook',
  ): Promise<User | null> {
    try {
      // Check if user exists with this email
      let user = await this.userRepository.findOne({
        where: { email: profile.email.toLowerCase().trim() },
        relations: ['counselorProfile', 'oauthProviders'],
      });

      if (!user) {
        // Create new user if doesn't exist
        user = this.userRepository.create({
          email: profile.email.toLowerCase().trim(),
          firstName: profile.firstName,
          lastName: profile.lastName,
          profilePictureUrl: profile.profilePictureUrl,
          role: UserRole.USER,
          timezone: 'UTC',
          isActive: true,
          isVerified: true, // OAuth users are considered verified
        });

        user = await this.userRepository.save(user);
      }

      // Check if this OAuth provider is already linked
      let oauthProvider = await this.oauthProviderRepository.findOne({
        where: {
          userId: user.id,
          provider,
          providerId: profile.id,
        },
      });

      if (!oauthProvider) {
        // Create OAuth provider record
        oauthProvider = this.oauthProviderRepository.create({
          userId: user.id,
          provider,
          providerId: profile.id,
          providerEmail: profile.email,
        });

        await this.oauthProviderRepository.save(oauthProvider);
      }

      // Update user's profile picture if not set
      if (!user.profilePictureUrl && profile.profilePictureUrl) {
        await this.userRepository.update(user.id, {
          profilePictureUrl: profile.profilePictureUrl,
        });
        user.profilePictureUrl = profile.profilePictureUrl;
      }

      // Update last login
      await this.userService.updateLastLogin(user.id);

      this.logger.log(
        `OAuth user validated successfully: ${user.id}, provider: ${provider}`,
      );
      return user;
    } catch (error) {
      this.logger.error(
        `OAuth user validation failed: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
