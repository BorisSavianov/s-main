// apps/notification-service/src/preferences/services/notification-preferences.controller.ts
import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { NotificationPreferencesService } from './notification-prefrences.service';
import { JwtAuthGuard } from 'apps/user-service/src/auth/guards/jwt-auth.guard';
import { UpdatePreferencesDto } from '../dtos/update-prefrrences.dto';

@ApiTags('notification-preferences')
@Controller('notification-preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get user notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'User preferences retrieved successfully',
  })
  async getMyPreferences(@Request() req) {
    return this.preferencesService.getUserPreferences(req.user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update user notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updateMyPreferences(
    @Request() req,
    @Body() updatePreferencesDto: UpdatePreferencesDto,
  ) {
    return this.preferencesService.updatePreferences(
      req.user.id,
      updatePreferencesDto.preferences,
    );
  }
}
