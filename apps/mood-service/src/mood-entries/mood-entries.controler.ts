// apps/mood-service/src/mood-entries/mood-entries.controller.ts
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

import { MoodEntriesService } from './mood-entries.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';

import {
  CreateMoodEntryDto,
  UpdateMoodEntryDto,
  MoodEntrySearchDto,
  MoodEntryResponseDto,
  PaginatedMoodEntriesResponseDto,
  MoodStatsDto,
  ApiResponseDto,
} from './dto/mood-entries.dto';

@ApiTags('Mood Entries')
@Controller('mood-entries')
@UseGuards(ThrottlerGuard)
export class MoodEntriesController {
  constructor(private readonly moodEntriesService: MoodEntriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create mood entry' })
  @ApiResponse({
    status: 201,
    description: 'Mood entry created successfully',
    type: MoodEntryResponseDto,
  })
  async createMoodEntry(
    @GetUser('userId') userId: string,
    @Body() createMoodEntryDto: CreateMoodEntryDto,
  ): Promise<ApiResponseDto<MoodEntryResponseDto>> {
    const entry = await this.moodEntriesService.createMoodEntry(
      userId,
      createMoodEntryDto,
    );

    return {
      success: true,
      message: 'Mood entry created successfully',
      data: entry,
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood entries' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  @ApiQuery({ name: 'maxRating', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Mood entries retrieved successfully',
    type: PaginatedMoodEntriesResponseDto,
  })
  async getMoodEntries(
    @GetUser('userId') userId: string,
    @Query() searchDto: MoodEntrySearchDto,
  ): Promise<ApiResponseDto<PaginatedMoodEntriesResponseDto>> {
    const result = await this.moodEntriesService.getMoodEntries(
      userId,
      searchDto,
    );

    return {
      success: true,
      message: 'Mood entries retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood statistics' })
  @ApiResponse({
    status: 200,
    description: 'Mood statistics retrieved successfully',
    type: MoodStatsDto,
  })
  async getMoodStats(
    @GetUser('userId') userId: string,
    @Query('days') days?: number,
  ): Promise<ApiResponseDto<MoodStatsDto>> {
    const stats = await this.moodEntriesService.getMoodStats(userId, days);

    return {
      success: true,
      message: 'Mood statistics retrieved successfully',
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':entryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood entry by ID' })
  @ApiParam({ name: 'entryId', description: 'Mood Entry UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood entry retrieved successfully',
    type: MoodEntryResponseDto,
  })
  async getMoodEntryById(
    @GetUser('userId') userId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ): Promise<ApiResponseDto<MoodEntryResponseDto>> {
    const entry = await this.moodEntriesService.getMoodEntryById(
      userId,
      entryId,
    );

    return {
      success: true,
      message: 'Mood entry retrieved successfully',
      data: entry,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('date/:date')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood entry by date' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({
    status: 200,
    description: 'Mood entry retrieved successfully',
    type: MoodEntryResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Mood entry not found for this date',
  })
  async getMoodEntryByDate(
    @GetUser('userId') userId: string,
    @Param('date') date: string,
  ): Promise<ApiResponseDto<MoodEntryResponseDto>> {
    const entry = await this.moodEntriesService.getMoodEntryByDate(
      userId,
      date,
    );

    return {
      success: true,
      message: 'Mood entry retrieved successfully',
      data: entry,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':entryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update mood entry' })
  @ApiParam({ name: 'entryId', description: 'Mood Entry UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood entry updated successfully',
    type: MoodEntryResponseDto,
  })
  async updateMoodEntry(
    @GetUser('userId') userId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() updateMoodEntryDto: UpdateMoodEntryDto,
  ): Promise<ApiResponseDto<MoodEntryResponseDto>> {
    const entry = await this.moodEntriesService.updateMoodEntry(
      userId,
      entryId,
      updateMoodEntryDto,
    );

    return {
      success: true,
      message: 'Mood entry updated successfully',
      data: entry,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':entryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete mood entry' })
  @ApiParam({ name: 'entryId', description: 'Mood Entry UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood entry deleted successfully',
  })
  async deleteMoodEntry(
    @GetUser('userId') userId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ): Promise<ApiResponseDto> {
    await this.moodEntriesService.deleteMoodEntry(userId, entryId);

    return {
      success: true,
      message: 'Mood entry deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
