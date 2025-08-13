// apps/mood-service/src/mood-patterns/mood-patterns.controller.ts
import {
  Controller,
  Get,
  Post,
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

import { MoodPatternsService } from './mood-patterns.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';

import {
  CreateMoodPatternDto,
  MoodPatternSearchDto,
  MoodPatternResponseDto,
  PatternAnalysisDto,
  PaginatedMoodPatternsResponseDto,
} from './dto/mood-patterns.dto';
import { ApiResponseDto } from '../mood-entries/dto/mood-entries.dto';

@ApiTags('Mood Patterns')
@Controller('mood-patterns')
@UseGuards(ThrottlerGuard)
export class MoodPatternsController {
  constructor(private readonly moodPatternsService: MoodPatternsService) {}

  @Post('analyze')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Analyze mood patterns' })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiResponse({
    status: 200,
    description: 'Mood patterns analyzed successfully',
    type: PatternAnalysisDto,
  })
  async analyzeMoodPatterns(
    @GetUser('userId') userId: string,
    @Query('days') days?: number,
  ): Promise<ApiResponseDto<PatternAnalysisDto>> {
    const analysis = await this.moodPatternsService.analyzeMoodPatterns(
      userId,
      days,
    );

    return {
      success: true,
      message: 'Mood patterns analyzed successfully',
      data: analysis,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate mood patterns from entries' })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiResponse({
    status: 201,
    description: 'Mood patterns generated successfully',
  })
  async generateMoodPatterns(
    @GetUser('userId') userId: string,
    @Query('days') days?: number,
  ): Promise<ApiResponseDto> {
    await this.moodPatternsService.generateMoodPatterns(userId, days);

    return {
      success: true,
      message: 'Mood patterns generated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood patterns' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'patternType', required: false, type: String })
  @ApiQuery({
    name: 'trendDirection',
    required: false,
    enum: ['improving', 'declining', 'stable'],
  })
  @ApiResponse({
    status: 200,
    description: 'Mood patterns retrieved successfully',
    type: PaginatedMoodPatternsResponseDto,
  })
  async getMoodPatterns(
    @GetUser('userId') userId: string,
    @Query() searchDto: MoodPatternSearchDto,
  ): Promise<ApiResponseDto<PaginatedMoodPatternsResponseDto>> {
    const result = await this.moodPatternsService.getMoodPatterns(
      userId,
      searchDto,
    );

    return {
      success: true,
      message: 'Mood patterns retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('weekly')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get weekly mood pattern' })
  @ApiQuery({ name: 'weeks', required: false, type: Number, example: 4 })
  @ApiResponse({
    status: 200,
    description: 'Weekly pattern retrieved successfully',
  })
  async getWeeklyPattern(
    @GetUser('userId') userId: string,
    @Query('weeks') weeks?: number,
  ): Promise<ApiResponseDto> {
    const pattern = await this.moodPatternsService.getWeeklyPattern(
      userId,
      weeks,
    );

    return {
      success: true,
      message: 'Weekly pattern retrieved successfully',
      data: pattern,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('monthly')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get monthly mood pattern' })
  @ApiQuery({ name: 'months', required: false, type: Number, example: 3 })
  @ApiResponse({
    status: 200,
    description: 'Monthly pattern retrieved successfully',
  })
  async getMonthlyPattern(
    @GetUser('userId') userId: string,
    @Query('months') months?: number,
  ): Promise<ApiResponseDto> {
    const pattern = await this.moodPatternsService.getMonthlyPattern(
      userId,
      months,
    );

    return {
      success: true,
      message: 'Monthly pattern retrieved successfully',
      data: pattern,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('correlations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood correlations' })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiResponse({
    status: 200,
    description: 'Correlations retrieved successfully',
  })
  async getMoodCorrelations(
    @GetUser('userId') userId: string,
    @Query('days') days?: number,
  ): Promise<ApiResponseDto> {
    const correlations = await this.moodPatternsService.getMoodCorrelations(
      userId,
      days,
    );

    return {
      success: true,
      message: 'Correlations retrieved successfully',
      data: correlations,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':patternId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood pattern by ID' })
  @ApiParam({ name: 'patternId', description: 'Mood Pattern UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood pattern retrieved successfully',
    type: MoodPatternResponseDto,
  })
  async getMoodPatternById(
    @GetUser('userId') userId: string,
    @Param('patternId', ParseUUIDPipe) patternId: string,
  ): Promise<ApiResponseDto<MoodPatternResponseDto>> {
    const pattern = await this.moodPatternsService.getMoodPatternById(
      userId,
      patternId,
    );

    return {
      success: true,
      message: 'Mood pattern retrieved successfully',
      data: pattern,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':patternId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete mood pattern' })
  @ApiParam({ name: 'patternId', description: 'Mood Pattern UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood pattern deleted successfully',
  })
  async deleteMoodPattern(
    @GetUser('userId') userId: string,
    @Param('patternId', ParseUUIDPipe) patternId: string,
  ): Promise<ApiResponseDto> {
    await this.moodPatternsService.deleteMoodPattern(userId, patternId);

    return {
      success: true,
      message: 'Mood pattern deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
