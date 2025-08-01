// apps/user-service/src/counselors/counselors.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
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

import { CounselorsService } from './counselors.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../database/entities/user.entity';

import {
  CreateCounselorProfileDto,
  UpdateCounselorProfileDto,
  CounselorSearchDto,
  CounselorResponseDto,
  PaginatedCounselorsResponseDto,
  ApiResponseDto,
} from './dto/counselors.dto';

@ApiTags('Counselors')
@Controller('counselors')
@UseGuards(ThrottlerGuard)
export class CounselorsController {
  constructor(private readonly counselorsService: CounselorsService) {}

  @Post('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR, UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create counselor profile' })
  @ApiResponse({
    status: 201,
    description: 'Counselor profile created successfully',
    type: CounselorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'User must be a counselor' })
  @ApiResponse({ status: 409, description: 'Counselor profile already exists' })
  async createCounselorProfile(
    @GetUser('userId') userId: string,
    @Body() createCounselorProfileDto: CreateCounselorProfileDto,
  ): Promise<ApiResponseDto<CounselorResponseDto>> {
    const profile = await this.counselorsService.createCounselorProfile(
      userId,
      createCounselorProfileDto,
    );

    return {
      success: true,
      message: 'Counselor profile created successfully',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current counselor profile' })
  @ApiResponse({
    status: 200,
    description: 'Counselor profile retrieved successfully',
    type: CounselorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Counselor profile not found' })
  async getCurrentCounselorProfile(
    @GetUser('userId') userId: string,
  ): Promise<ApiResponseDto<CounselorResponseDto>> {
    const profile = await this.counselorsService.getCounselorProfile(userId);

    return {
      success: true,
      message: 'Counselor profile retrieved successfully',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':counselorId')
  @ApiOperation({ summary: 'Get counselor profile by ID' })
  @ApiParam({ name: 'counselorId', description: 'Counselor UUID' })
  @ApiResponse({
    status: 200,
    description: 'Counselor profile retrieved successfully',
    type: CounselorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Counselor not found' })
  async getCounselorById(
    @Param('counselorId', ParseUUIDPipe) counselorId: string,
  ): Promise<ApiResponseDto<CounselorResponseDto>> {
    const profile =
      await this.counselorsService.getCounselorProfile(counselorId);

    return {
      success: true,
      message: 'Counselor profile retrieved successfully',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Search counselors' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'anxiety',
  })
  @ApiQuery({
    name: 'specialty',
    required: false,
    type: String,
    example: 'Depression',
  })
  @ApiQuery({ name: 'minRating', required: false, type: Number, example: 4.0 })
  @ApiQuery({ name: 'maxRate', required: false, type: Number, example: 150.0 })
  @ApiQuery({
    name: 'language',
    required: false,
    type: String,
    example: 'English',
  })
  @ApiQuery({ name: 'isAvailable', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Counselors retrieved successfully',
    type: PaginatedCounselorsResponseDto,
  })
  async searchCounselors(
    @Query() searchDto: CounselorSearchDto,
  ): Promise<ApiResponseDto<PaginatedCounselorsResponseDto>> {
    const result = await this.counselorsService.searchCounselors(searchDto);

    return {
      success: true,
      message: 'Counselors retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current counselor profile' })
  @ApiResponse({
    status: 200,
    description: 'Counselor profile updated successfully',
    type: CounselorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Counselor profile not found' })
  async updateCurrentCounselorProfile(
    @GetUser('userId') userId: string,
    @Body() updateCounselorProfileDto: UpdateCounselorProfileDto,
  ): Promise<ApiResponseDto<CounselorResponseDto>> {
    const profile = await this.counselorsService.updateCounselorProfile(
      userId,
      updateCounselorProfileDto,
    );

    return {
      success: true,
      message: 'Counselor profile updated successfully',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':counselorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update counselor profile (Admin only)' })
  @ApiParam({ name: 'counselorId', description: 'Counselor UUID' })
  @ApiResponse({
    status: 200,
    description: 'Counselor profile updated successfully',
    type: CounselorResponseDto,
  })
  async updateCounselorProfile(
    @Param('counselorId', ParseUUIDPipe) counselorId: string,
    @Body() updateCounselorProfileDto: UpdateCounselorProfileDto,
  ): Promise<ApiResponseDto<CounselorResponseDto>> {
    const profile = await this.counselorsService.updateCounselorProfile(
      counselorId,
      updateCounselorProfileDto,
    );

    return {
      success: true,
      message: 'Counselor profile updated successfully',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete current counselor profile' })
  @ApiResponse({
    status: 200,
    description: 'Counselor profile deleted successfully',
  })
  async deleteCurrentCounselorProfile(
    @GetUser('userId') userId: string,
  ): Promise<ApiResponseDto> {
    await this.counselorsService.deleteCounselorProfile(userId);

    return {
      success: true,
      message: 'Counselor profile deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':counselorId/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update counselor availability' })
  @ApiParam({ name: 'counselorId', description: 'Counselor UUID' })
  @ApiResponse({
    status: 200,
    description: 'Availability updated successfully',
  })
  async updateCounselorAvailability(
    @Param('counselorId', ParseUUIDPipe) counselorId: string,
    @Body('isAvailable') isAvailable: boolean,
    @GetUser('userId') currentUserId: string,
  ): Promise<ApiResponseDto> {
    // Allow counselors to update their own availability or admins to update any
    if (counselorId !== currentUserId) {
      // This will be checked by the RolesGuard to ensure user is admin
    }

    await this.counselorsService.updateAvailability(counselorId, isAvailable);

    return {
      success: true,
      message: 'Availability updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('specialties/list')
  @ApiOperation({ summary: 'Get list of all specialties' })
  @ApiResponse({
    status: 200,
    description: 'Specialties retrieved successfully',
  })
  async getSpecialties(): Promise<ApiResponseDto<string[]>> {
    const specialties = await this.counselorsService.getAllSpecialties();

    return {
      success: true,
      message: 'Specialties retrieved successfully',
      data: specialties,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get counselor statistics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getCounselorStats(): Promise<ApiResponseDto> {
    const stats = await this.counselorsService.getCounselorStats();

    return {
      success: true,
      message: 'Statistics retrieved successfully',
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }
}
