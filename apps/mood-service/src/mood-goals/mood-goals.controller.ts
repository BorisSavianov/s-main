// apps/mood-service/src/mood-goals/mood-goals.controller.ts
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
} from '@nestjs/swagger';

import { MoodGoalsService } from './mood-goals.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import { ApiResponseDto } from '../mood-entries/dto/mood-entries.dto';

import {
  CreateMoodGoalDto,
  UpdateMoodGoalDto,
  MoodGoalSearchDto,
  MoodGoalResponseDto,
} from './dto/mood-goals.dto';

@ApiTags('Mood Goals')
@Controller('mood-goals')
@UseGuards(ThrottlerGuard)
export class MoodGoalsController {
  constructor(private readonly moodGoalsService: MoodGoalsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create mood goal' })
  @ApiResponse({
    status: 201,
    description: 'Mood goal created successfully',
    type: MoodGoalResponseDto,
  })
  async createMoodGoal(
    @GetUser('userId') userId: string,
    @Body() createMoodGoalDto: CreateMoodGoalDto,
  ): Promise<ApiResponseDto<MoodGoalResponseDto>> {
    const goal = await this.moodGoalsService.createMoodGoal(
      userId,
      createMoodGoalDto,
    );

    return {
      success: true,
      message: 'Mood goal created successfully',
      data: goal,
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood goals' })
  @ApiResponse({
    status: 200,
    description: 'Mood goals retrieved successfully',
  })
  async getMoodGoals(
    @GetUser('userId') userId: string,
    @Query() searchDto: MoodGoalSearchDto,
  ): Promise<ApiResponseDto> {
    const result = await this.moodGoalsService.getMoodGoals(userId, searchDto);

    return {
      success: true,
      message: 'Mood goals retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':goalId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood goal by ID' })
  @ApiParam({ name: 'goalId', description: 'Mood Goal UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood goal retrieved successfully',
    type: MoodGoalResponseDto,
  })
  async getMoodGoalById(
    @GetUser('userId') userId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<ApiResponseDto<MoodGoalResponseDto>> {
    const goal = await this.moodGoalsService.getMoodGoalById(userId, goalId);

    return {
      success: true,
      message: 'Mood goal retrieved successfully',
      data: goal,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':goalId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update mood goal' })
  @ApiParam({ name: 'goalId', description: 'Mood Goal UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood goal updated successfully',
    type: MoodGoalResponseDto,
  })
  async updateMoodGoal(
    @GetUser('userId') userId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() updateMoodGoalDto: UpdateMoodGoalDto,
  ): Promise<ApiResponseDto<MoodGoalResponseDto>> {
    const goal = await this.moodGoalsService.updateMoodGoal(
      userId,
      goalId,
      updateMoodGoalDto,
    );

    return {
      success: true,
      message: 'Mood goal updated successfully',
      data: goal,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':goalId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete mood goal' })
  @ApiParam({ name: 'goalId', description: 'Mood Goal UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood goal deleted successfully',
  })
  async deleteMoodGoal(
    @GetUser('userId') userId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<ApiResponseDto> {
    await this.moodGoalsService.deleteMoodGoal(userId, goalId);

    return {
      success: true,
      message: 'Mood goal deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
