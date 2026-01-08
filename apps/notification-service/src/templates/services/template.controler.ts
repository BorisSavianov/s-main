// apps/notification-service/src/templates/services/template.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { TemplateService } from '../services/template.service';
import { JwtAuthGuard } from 'apps/user-service/src/auth/guards/jwt-auth.guard';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TestTemplateDto,
} from '../dtos/template.dto';
import { RolesGuard } from 'apps/auth-service/src/auth/guards/roles.guard';
import { UserRole } from 'apps/auth-service/src/database/entities/user.entity';
import { Roles } from 'apps/auth-service/src/auth/decorators/roles.decorator';

@ApiTags('notification-templates')
@Controller('notification-templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notification templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by template category',
  })
  async getTemplates(@Query('category') category?: string) {
    if (category) {
      return this.templateService.getTemplatesByCategory(category);
    }
    return this.templateService.getAllTemplates();
  }

  @Get(':templateName')
  @ApiOperation({ summary: 'Get a specific notification template' })
  @ApiParam({ name: 'templateName', description: 'Template name' })
  @ApiResponse({ status: 200, description: 'Template retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(@Param('templateName') templateName: string) {
    return this.templateService.getTemplate(templateName);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new notification template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(@Body() createTemplateDto: CreateTemplateDto) {
    return this.templateService.createTemplate(createTemplateDto);
  }

  @Put(':templateName')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a notification template' })
  @ApiParam({ name: 'templateName', description: 'Template name' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async updateTemplate(
    @Param('templateName') templateName: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templateService.updateTemplate(templateName, updateTemplateDto);
  }

  @Post(':templateName/test')
  @ApiOperation({ summary: 'Test a notification template with sample data' })
  @ApiParam({ name: 'templateName', description: 'Template name' })
  @ApiResponse({ status: 200, description: 'Template rendered successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async testTemplate(
    @Param('templateName') templateName: string,
    @Body() testTemplateDto: TestTemplateDto,
  ) {
    return this.templateService.renderTemplate(
      templateName,
      testTemplateDto.data,
      testTemplateDto.notificationType,
    );
  }
}
