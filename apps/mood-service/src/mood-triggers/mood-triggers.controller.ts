// apps/mood-service/src/mood-triggers/mood-triggers.controller.ts
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

import { MoodTriggersService } from './mood-triggers.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import { ApiResponseDto } from '../mood-entries/dto/mood-entries.dto';

import {
  CreateMoodTriggerDto,
  UpdateMoodTriggerDto,
  MoodTriggerSearchDto,
  MoodTriggerResponseDto,
} from './dto/mood-triggers.dto';

@ApiTags('Mood Triggers')
@Controller('mood-triggers')
@UseGuards(ThrottlerGuard)
export class MoodTriggersController {
  constructor(private readonly moodTriggersService: MoodTriggersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create mood trigger' })
  @ApiResponse({
    status: 201,
    description: 'Mood trigger created successfully',
    type: MoodTriggerResponseDto,
  })
  async createMoodTrigger(
    @GetUser('userId') userId: string,
    @Body() createMoodTriggerDto: CreateMoodTriggerDto,
  ): Promise<ApiResponseDto<MoodTriggerResponseDto>> {
    const trigger = await this.moodTriggersService.createMoodTrigger(
      userId,
      createMoodTriggerDto,
    );

    return {
      success: true,
      message: 'Mood trigger created successfully',
      data: trigger,
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood triggers' })
  @ApiResponse({
    status: 200,
    description: 'Mood triggers retrieved successfully',
  })
  async getMoodTriggers(
    @GetUser('userId') userId: string,
    @Query() searchDto: MoodTriggerSearchDto,
  ): Promise<ApiResponseDto> {
    const result = await this.moodTriggersService.getMoodTriggers(
      userId,
      searchDto,
    );

    return {
      success: true,
      message: 'Mood triggers retrieved successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('top')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top mood triggers' })
  @ApiResponse({
    status: 200,
    description: 'Top triggers retrieved successfully',
  })
  async getTopTriggers(
    @GetUser('userId') userId: string,
    @Query('limit') limit?: number,
  ): Promise<ApiResponseDto> {
    const triggers = await this.moodTriggersService.getTopTriggers(
      userId,
      limit,
    );

    return {
      success: true,
      message: 'Top triggers retrieved successfully',
      data: triggers,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':triggerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mood trigger by ID' })
  @ApiParam({ name: 'triggerId', description: 'Mood Trigger UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood trigger retrieved successfully',
    type: MoodTriggerResponseDto,
  })
  async getMoodTriggerById(
    @GetUser('userId') userId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
  ): Promise<ApiResponseDto<MoodTriggerResponseDto>> {
    const trigger = await this.moodTriggersService.getMoodTriggerById(
      userId,
      triggerId,
    );

    return {
      success: true,
      message: 'Mood trigger retrieved successfully',
      data: trigger,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':triggerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update mood trigger' })
  @ApiParam({ name: 'triggerId', description: 'Mood Trigger UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood trigger updated successfully',
    type: MoodTriggerResponseDto,
  })
  async updateMoodTrigger(
    @GetUser('userId') userId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @Body() updateMoodTriggerDto: UpdateMoodTriggerDto,
  ): Promise<ApiResponseDto<MoodTriggerResponseDto>> {
    const trigger = await this.moodTriggersService.updateMoodTrigger(
      userId,
      triggerId,
      updateMoodTriggerDto,
    );

    return {
      success: true,
      message: 'Mood trigger updated successfully',
      data: trigger,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':triggerId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete mood trigger' })
  @ApiParam({ name: 'triggerId', description: 'Mood Trigger UUID' })
  @ApiResponse({
    status: 200,
    description: 'Mood trigger deleted successfully',
  })
  async deleteMoodTrigger(
    @GetUser('userId') userId: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
  ): Promise<ApiResponseDto> {
    await this.moodTriggersService.deleteMoodTrigger(userId, triggerId);

    return {
      success: true,
      message: 'Mood trigger deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
