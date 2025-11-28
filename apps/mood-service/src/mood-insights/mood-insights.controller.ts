// apps/mood-service/src/mood-insights/mood-insights.controller.ts
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

import { MoodInsightsService } from './mood-insights.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import { ApiResponseDto } from '../mood-entries/dto/mood-entries.dto';

import {
  CreateMoodInsightDto,
  MoodInsightSearchDto,
  MoodInsightResponseDto,
} from './dto/mood-insights.dto';

@ApiTags('Mood Insights')
@Controller('mood-insights')
@UseGuards(ThrottlerGuard)
export class MoodInsightsController {
  constructor(private readonly moodInsightsService: MoodInsightsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood insights' })
  @ApiResponse({
    status: 200,
    description: 'Mood insights retrieved successfully',
  })
  async getMoodInsights(
    @GetUser('userId') userId: string,
    @Query() searchDto: MoodInsightSearchDto,
  ): Promise<ApiResponseDto> {
    const result = await this.moodInsightsService.getMoodInsights(
      userId,
      searchDto,
    );

    return {
      success: true,
      message: 'Mood insights retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('generate-ai')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate AI-driven insights' })
  @ApiResponse({
    status: 201,
    description: 'AI insights generated successfully',
  })
  async generateAiInsights(
    @GetUser('userId') userId: string,
    @Query('days') days?: number,
  ): Promise<ApiResponseDto> {
    const result = await this.moodInsightsService.generateAiInsights(
      userId,
      days,
    );

    return {
      success: true,
      message: `Generated ${result.generated} AI insights`,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':insightId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood insight by ID' })
  @ApiParam({ name: 'insightId', description: 'Mood Insight UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood insight retrieved successfully',
    type: MoodInsightResponseDto,
  })
  async getMoodInsightById(
    @GetUser('userId') userId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
  ): Promise<ApiResponseDto<MoodInsightResponseDto>> {
    const insight = await this.moodInsightsService.getMoodInsightById(
      userId,
      insightId,
    );

    return {
      success: true,
      message: 'Mood insight retrieved successfully',
      data: insight,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':insightId/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark insight as read' })
  @ApiParam({ name: 'insightId', description: 'Mood Insight UUID' })
  @ApiResponse({
    status: 200,
    description: 'Insight marked as read successfully',
  })
  async markAsRead(
    @GetUser('userId') userId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
  ): Promise<ApiResponseDto> {
    await this.moodInsightsService.markAsRead(userId, insightId);

    return {
      success: true,
      message: 'Insight marked as read successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':insightId/helpful')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark insight as helpful/unhelpful' })
  @ApiParam({ name: 'insightId', description: 'Mood Insight UUID' })
  @ApiResponse({
    status: 200,
    description: 'Insight feedback updated successfully',
  })
  async markAsHelpful(
    @GetUser('userId') userId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
    @Body('isHelpful') isHelpful: boolean,
  ): Promise<ApiResponseDto> {
    await this.moodInsightsService.markAsHelpful(userId, insightId, isHelpful);

    return {
      success: true,
      message: 'Insight feedback updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':insightId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete mood insight' })
  @ApiParam({ name: 'insightId', description: 'Mood Insight UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood insight deleted successfully',
  })
  async deleteMoodInsight(
    @GetUser('userId') userId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
  ): Promise<ApiResponseDto> {
    await this.moodInsightsService.deleteMoodInsight(userId, insightId);

    return {
      success: true,
      message: 'Mood insight deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
