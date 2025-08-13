// apps/mood-service/src/mood-goals/dto/mood-goals.dto.ts
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMoodGoalDto {
  @ApiProperty({ example: 'daily_rating' })
  @IsString()
  goalType: string;

  @ApiProperty({ example: 4.0 })
  @IsNumber()
  @Min(0)
  @Max(5)
  targetValue: number;

  @ApiPropertyOptional({ example: '2024-02-15' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({
    example: 'Maintain an average mood rating of 4.0 or higher',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateMoodGoalDto {
  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  targetValue?: number;

  @ApiPropertyOptional({ example: '2024-03-15' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ example: 'Updated goal description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MoodGoalResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'uuid-here' })
  userId: string;

  @ApiProperty({ example: 'daily_rating' })
  goalType: string;

  @ApiProperty({ example: 4.0 })
  targetValue: number;

  @ApiProperty({ example: 3.8 })
  currentValue: number;

  @ApiPropertyOptional({ example: '2024-02-15' })
  targetDate?: string;

  @ApiProperty({ example: false })
  isAchieved: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({
    example: 'Maintain an average mood rating of 4.0 or higher',
  })
  description?: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  updatedAt: string;
}
