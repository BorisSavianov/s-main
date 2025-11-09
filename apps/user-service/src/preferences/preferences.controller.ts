// apps/auth-service/src/preferences/preferences.controller.ts
import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { PreferencesService } from './preferences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('preferences')
@ApiTags('User Preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get user preferences' })
  @ApiResponse({
    status: 200,
    description: 'Preferences retrieved successfully',
  })
  async getPreferences(@GetUser() user: any) {
    const preferences = await this.preferencesService.getUserPreferences(
      user.id,
    );

    return {
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updatePreferences(@Body() updates: any, @GetUser() user: any) {
    const preferences = await this.preferencesService.updatePreferences(
      user.id,
      updates,
    );

    return {
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    };
  }
}
