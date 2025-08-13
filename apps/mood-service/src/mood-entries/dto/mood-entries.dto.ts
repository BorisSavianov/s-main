// apps/mood-service/src/mood-entries/dto/mood-entries.dto.ts
import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { MoodRating } from '../../database/entities/mood-entry.entity';

export class CreateMoodEntryDto {
  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: MoodRating.GOOD, enum: MoodRating })
  @IsEnum(MoodRating)
  moodRating: MoodRating;

  @ApiPropertyOptional({ example: 'Had a productive day at work' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  energyLevel?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  stressLevel?: number;

  @ApiPropertyOptional({ example: 7.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  sleepHours?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exerciseMinutes?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  medicationTaken?: boolean;

  @ApiPropertyOptional({ example: ['work stress', 'traffic'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggers?: string[];

  @ApiPropertyOptional({ example: ['meditation', 'reading'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activities?: string[];

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  entryDate: string;
}

export class UpdateMoodEntryDto {
  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: MoodRating.GOOD, enum: MoodRating })
  @IsOptional()
  @IsEnum(MoodRating)
  moodRating?: MoodRating;

  @ApiPropertyOptional({ example: 'Had a productive day at work' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  energyLevel?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  stressLevel?: number;

  @ApiPropertyOptional({ example: 7.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  sleepHours?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exerciseMinutes?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  medicationTaken?: boolean;

  @ApiPropertyOptional({ example: ['work stress', 'traffic'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggers?: string[];

  @ApiPropertyOptional({ example: ['meditation', 'reading'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activities?: string[];
}

export class MoodEntrySearchDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-01-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  maxRating?: number;

  @ApiPropertyOptional({ example: MoodRating.GOOD, enum: MoodRating })
  @IsOptional()
  @IsEnum(MoodRating)
  moodRating?: MoodRating;
}

export class MoodEntryResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'uuid-here' })
  userId: string;

  @ApiProperty({ example: 4 })
  rating: number;

  @ApiProperty({ example: MoodRating.GOOD, enum: MoodRating })
  moodRating: MoodRating;

  @ApiPropertyOptional({ example: 'Had a productive day at work' })
  notes?: string;

  @ApiPropertyOptional({ example: 7 })
  energyLevel?: number;

  @ApiPropertyOptional({ example: 3 })
  stressLevel?: number;

  @ApiPropertyOptional({ example: 7.5 })
  sleepHours?: number;

  @ApiPropertyOptional({ example: 30 })
  exerciseMinutes?: number;

  @ApiPropertyOptional({ example: true })
  medicationTaken?: boolean;

  @ApiPropertyOptional({ example: ['work stress', 'traffic'] })
  triggers?: string[];

  @ApiPropertyOptional({ example: ['meditation', 'reading'] })
  activities?: string[];

  @ApiProperty({ example: '2024-01-15' })
  entryDate: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  updatedAt: string;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 4 })
  pages: number;
}

export class PaginatedMoodEntriesResponseDto {
  @ApiProperty({ type: [MoodEntryResponseDto] })
  entries: MoodEntryResponseDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

export class MoodStatsDto {
  @ApiProperty({ example: 4.2 })
  averageRating: number;

  @ApiProperty({ example: 25 })
  totalEntries: number;

  @ApiProperty({ example: 18 })
  streakDays: number;

  @ApiProperty({
    example: { very_good: 10, good: 8, neutral: 5, poor: 2, very_poor: 0 },
  })
  moodDistribution: Record<string, number>;

  @ApiProperty({ example: ['work stress', 'lack of sleep'] })
  topTriggers: string[];

  @ApiProperty({ example: ['meditation', 'exercise'] })
  topActivities: string[];
}

export class ApiResponseDto<T = any> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;

  @ApiPropertyOptional()
  data?: T;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  timestamp: string;
}
