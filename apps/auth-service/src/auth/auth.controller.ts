// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  UseGuards,
  Request,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';

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
  OAuthCallbackDto,
  LoginResponseDto,
  UserResponseDto,
  ApiResponseDto,
} from './dto/auth.dto';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<ApiResponseDto<LoginResponseDto>> {
    const result = await this.authService.register(registerDto, ip, userAgent);

    return {
      success: true,
      message: 'User registered successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account deactivated' })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<ApiResponseDto<LoginResponseDto>> {
    const result = await this.authService.login(loginDto, ip, userAgent);

    return {
      success: true,
      message: 'Login successful',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@GetUser('sessionId') sessionId: string): Promise<ApiResponseDto> {
    await this.authService.logout(sessionId);

    return {
      success: true,
      message: 'Logout successful',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'Logged out from all devices' })
  async logoutAll(@GetUser('userId') userId: string): Promise<ApiResponseDto> {
    await this.authService.logoutAll(userId);

    return {
      success: true,
      message: 'Logged out from all devices',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<ApiResponseDto<LoginResponseDto>> {
    const result = await this.authService.refreshToken(
      refreshTokenDto.refreshToken,
      ip,
      userAgent,
    );

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<ApiResponseDto> {
    await this.authService.forgotPassword(forgotPasswordDto);

    return {
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<ApiResponseDto> {
    await this.authService.resetPassword(resetPasswordDto);

    return {
      success: true,
      message: 'Password reset successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @GetUser('userId') userId: string,
  ): Promise<ApiResponseDto> {
    await this.authService.changePassword(userId, changePasswordDto);

    return {
      success: true,
      message: 'Password changed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification token' })
  async verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
  ): Promise<ApiResponseDto> {
    await this.userService.verifyEmail(verifyEmailDto.token);

    return {
      success: true,
      message: 'Email verified successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  async resendVerification(
    @GetUser('userId') userId: string,
  ): Promise<ApiResponseDto> {
    await this.userService.resendVerificationEmail(userId);

    return {
      success: true,
      message: 'Verification email sent',
      timestamp: new Date().toISOString(),
    };
  }

  // OAuth endpoints
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth login' })
  async googleAuth() {
    // Handled by GoogleAuthGuard
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(
    @Request() req: any,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.handleOAuthCallback(
      req.user,
      'google',
      ip,
      userAgent,
    );

    // Redirect to frontend with tokens in URL params
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/auth/callback?accessToken=${encodeURIComponent(result.accessToken)}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    
    return req.res.redirect(callbackUrl);
  }

  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  @ApiOperation({ summary: 'Facebook OAuth login' })
  async facebookAuth() {
    // Handled by FacebookAuthGuard
  }

  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  @ApiOperation({ summary: 'Facebook OAuth callback' })
  async facebookAuthCallback(
    @Request() req: any,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.handleOAuthCallback(
      req.user,
      'facebook',
      ip,
      userAgent,
    );

    // Redirect to frontend with tokens in URL params
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/auth/callback?accessToken=${encodeURIComponent(result.accessToken)}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    
    return req.res.redirect(callbackUrl);
  }
}
