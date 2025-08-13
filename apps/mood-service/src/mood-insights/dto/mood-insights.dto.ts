// apps/mood-service/src/mood-insights/dto/mood-insights.dto.ts
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMoodInsightDto {
  @ApiProperty({ example: 'pattern' })
  @IsString()
  insightType: string;

  @ApiProperty({ example: 'Your mood tends to improve on weekends' })
  @IsString()
  @MaxLength(1000)
  insightText: string;

  @ApiPropertyOptional({ example: 0.85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  dataPoints?: number;
}

export class MoodInsightSearchDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'pattern' })
  @IsOptional()
  @IsString()
  insightType?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}

export class MoodInsightResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'uuid-here' })
  userId: string;

  @ApiProperty({ example: 'pattern' })
  insightType: string;

  @ApiProperty({ example: 'Your mood tends to improve on weekends' })
  insightText: string;

  @ApiPropertyOptional({ example: 0.85 })
  confidenceScore?: number;

  @ApiPropertyOptional({ example: 30 })
  dataPoints?: number;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiPropertyOptional({ example: true })
  isHelpful?: boolean;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  updatedAt: string;
}
