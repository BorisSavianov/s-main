// apps/user-service/src/users/users.controller.ts
import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../database/entities/user.entity';

import {
  UpdateProfileDto,
  UserResponseDto,
  ApiResponseDto,
  UserSearchDto,
  PaginatedUsersResponseDto,
} from './dto/users.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(ThrottlerGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  async getCurrentUserProfile(
    @GetUser('userId') userId: string,
  ): Promise<ApiResponseDto<UserResponseDto>> {
    const user = await this.usersService.getUserById(userId);

    return {
      success: true,
      message: 'User profile retrieved successfully',
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COUNSELOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by ID (Admin/Counselor only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ApiResponseDto<UserResponseDto>> {
    const user = await this.usersService.getUserById(userId);

    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'john' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'isVerified', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: PaginatedUsersResponseDto,
  })
  async searchUsers(
    @Query() searchDto: UserSearchDto,
  ): Promise<ApiResponseDto<PaginatedUsersResponseDto>> {
    const result = await this.usersService.searchUsers(searchDto);

    return {
      success: true,
      message: 'Users retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  async updateCurrentUserProfile(
    @GetUser('userId') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ApiResponseDto<UserResponseDto>> {
    const user = await this.usersService.updateProfile(
      userId,
      updateProfileDto,
    );

    return {
      success: true,
      message: 'Profile updated successfully',
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  async updateUserProfile(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ApiResponseDto<UserResponseDto>> {
    const user = await this.usersService.updateProfile(
      userId,
      updateProfileDto,
    );

    return {
      success: true,
      message: 'User profile updated successfully',
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  async deleteCurrentUserAccount(
    @GetUser('userId') userId: string,
  ): Promise<ApiResponseDto> {
    await this.usersService.deleteAccount(userId);

    return {
      success: true,
      message: 'Account deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user account (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User account deleted successfully',
  })
  async deleteUserAccount(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ApiResponseDto> {
    await this.usersService.deleteAccount(userId);

    return {
      success: true,
      message: 'User account deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':userId/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate user account (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User account activated successfully',
  })
  async activateUserAccount(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ApiResponseDto> {
    await this.usersService.activateAccount(userId);

    return {
      success: true,
      message: 'User account activated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':userId/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate user account (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User account deactivated successfully',
  })
  async deactivateUserAccount(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ApiResponseDto> {
    await this.usersService.deactivateAccount(userId);

    return {
      success: true,
      message: 'User account deactivated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('profile/sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user sessions' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async getCurrentUserSessions(
    @GetUser('userId') userId: string,
    @GetUser('sessionId') sessionId: string,
  ): Promise<ApiResponseDto> {
    const sessions = await this.usersService.getUserSessions(userId, sessionId);

    return {
      success: true,
      message: 'Sessions retrieved successfully',
      data: sessions,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('profile/sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke specific session' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  async revokeUserSession(
    @GetUser('userId') userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<ApiResponseDto> {
    await this.usersService.revokeSession(userId, sessionId);

    return {
      success: true,
      message: 'Session revoked successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('profile/check-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if current session is still valid' })
  @ApiResponse({ status: 200, description: 'Session is valid' })
  @ApiResponse({ status: 401, description: 'Session expired or invalid' })
  async checkSession(
    @GetUser('userId') userId: string,
    @GetUser('sessionId') sessionId: string,
  ): Promise<ApiResponseDto<{ valid: boolean }>> {
    // Reuse your service logic
    try {
      await this.usersService.checkSession(userId, sessionId);
      return {
      success: true,
      message: 'Session is valid',
      data: { valid: true },
      timestamp: new Date().toISOString(),
      };
    } catch (err) {
    if (err instanceof UnauthorizedException) {
      return {
        success: false,
        message: err.message,
        data: { valid: false },
        timestamp: new Date().toISOString(),
      };
    }
    throw err;
    }
  }
}
  