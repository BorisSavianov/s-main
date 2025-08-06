// apps/notification-service/src/templates/dto/template.dto.ts
import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../../notifications/entities/notification.entity';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Unique template name' })
  @IsString()
  templateName: string;

  @ApiProperty({ description: 'Template category' })
  @IsString()
  templateCategory: string;

  @ApiPropertyOptional({
    description: 'Subject template (for email notifications)',
  })
  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @ApiProperty({ description: 'Body template (supports Handlebars syntax)' })
  @IsString()
  bodyTemplate: string;

  @ApiProperty({
    description: 'Supported notification channels',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  supportedChannels: string[];

  @ApiPropertyOptional({ description: 'Template variables', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({
    description: 'Whether template is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({ description: 'Template category' })
  @IsOptional()
  @IsString()
  templateCategory?: string;

  @ApiPropertyOptional({
    description: 'Subject template (for email notifications)',
  })
  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @ApiPropertyOptional({
    description: 'Body template (supports Handlebars syntax)',
  })
  @IsOptional()
  @IsString()
  bodyTemplate?: string;

  @ApiPropertyOptional({
    description: 'Supported notification channels',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedChannels?: string[];

  @ApiPropertyOptional({ description: 'Template variables', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({ description: 'Whether template is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestTemplateDto {
  @ApiProperty({
    enum: NotificationType,
    description: 'Notification type to test',
  })
  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @ApiProperty({ description: 'Test data for template rendering' })
  @IsObject()
  data: Record<string, any>;
}
