// src/scheduling/dto/scheduling-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsDateString,
  IsEnum,
  IsString,
  IsNumber,
} from 'class-validator';
import {
  MeetingStatus,
  MeetingType,
} from '../entities/scheduled-meeting.entity';

export class SchedulingQueryDto {
  @ApiPropertyOptional({
    description: 'Filter start date (ISO)',
    example: '2025-08-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter end date (ISO)',
    example: '2025-08-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by counselor ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsString()
  counselorId?: string;

  @ApiPropertyOptional({
    enum: MeetingStatus,
    description: 'Filter by meeting status',
  })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional({
    enum: MeetingType,
    description: 'Filter by meeting type',
  })
  @IsOptional()
  @IsEnum(MeetingType)
  meetingType?: MeetingType;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number = 10;
}
