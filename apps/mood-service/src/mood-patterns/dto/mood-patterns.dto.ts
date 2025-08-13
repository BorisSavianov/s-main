// apps/mood-service/src/mood-patterns/dto/mood-patterns.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TrendDirection } from '../../database/entities/mood-pattern.entity';

export class CreateMoodPatternDto {
  @ApiProperty({ example: 'weekly' })
  @IsString()
  patternType: string;

  @ApiProperty({ example: { averages: [3.5, 4.2, 3.8], trends: ['stable'] } })
  patternData: any;

  @ApiPropertyOptional({ example: 3.8 })
  @IsOptional()
  @IsNumber()
  averageRating?: number;

  @ApiPropertyOptional({ example: TrendDirection.STABLE, enum: TrendDirection })
  @IsOptional()
  @IsEnum(TrendDirection)
  trendDirection?: TrendDirection;

  @ApiPropertyOptional({ example: 0.85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-01-07' })
  @IsDateString()
  endDate: string;
}

export class MoodPatternSearchDto {
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

  @ApiPropertyOptional({ example: 'weekly' })
  @IsOptional()
  @IsString()
  patternType?: string;

  @ApiPropertyOptional({
    example: TrendDirection.IMPROVING,
    enum: TrendDirection,
  })
  @IsOptional()
  @IsEnum(TrendDirection)
  trendDirection?: TrendDirection;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-01-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class MoodPatternResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'uuid-here' })
  userId: string;

  @ApiProperty({ example: 'weekly' })
  patternType: string;

  @ApiProperty({ example: { averages: [3.5, 4.2, 3.8], trends: ['stable'] } })
  patternData: any;

  @ApiPropertyOptional({ example: 3.8 })
  averageRating?: number;

  @ApiPropertyOptional({ example: TrendDirection.STABLE, enum: TrendDirection })
  trendDirection?: TrendDirection;

  @ApiPropertyOptional({ example: 0.85 })
  confidenceScore?: number;

  @ApiProperty({ example: '2024-01-01' })
  startDate: string;

  @ApiProperty({ example: '2024-01-07' })
  endDate: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  updatedAt: string;
}

export class WeeklyPatternDto {
  @ApiProperty({ example: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] })
  days: string[];

  @ApiProperty({ example: [3.5, 4.2, 3.8, 4.0, 3.9, 4.5, 4.1] })
  averageRatings: number[];

  @ApiProperty({ example: [2, 3, 1, 2, 2, 1, 2] })
  entryCounts: number[];

  @ApiProperty({ example: TrendDirection.STABLE })
  trend: TrendDirection;
}

export class MonthlyPatternDto {
  @ApiProperty({ example: ['Week 1', 'Week 2', 'Week 3', 'Week 4'] })
  weeks: string[];

  @ApiProperty({ example: [3.8, 4.1, 3.9, 4.2] })
  averageRatings: number[];

  @ApiProperty({ example: [7, 6, 7, 5] })
  entryCounts: number[];

  @ApiProperty({ example: TrendDirection.IMPROVING })
  trend: TrendDirection;
}

export class HourlyPatternDto {
  @ApiProperty({ example: Array.from({ length: 24 }, (_, i) => i) })
  hours: number[];

  @ApiProperty({ example: Array.from({ length: 24 }, () => Math.random() * 5) })
  averageRatings: number[];

  @ApiProperty({
    example: Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)),
  })
  entryCounts: number[];

  @ApiProperty({
    example: { morning: 3.8, afternoon: 4.1, evening: 3.9, night: 3.5 },
  })
  timeOfDayAverages: Record<string, number>;
}

export class CorrelationDto {
  @ApiProperty({ example: 'sleep_hours' })
  factor: string;

  @ApiProperty({ example: 0.75 })
  correlation: number;

  @ApiProperty({ example: 'strong_positive' })
  strength: string;

  @ApiProperty({
    example: 'Sleep hours show strong positive correlation with mood ratings',
  })
  description: string;
}

export class PatternAnalysisDto {
  @ApiProperty({ type: WeeklyPatternDto })
  weeklyPattern: WeeklyPatternDto;

  @ApiProperty({ type: MonthlyPatternDto })
  monthlyPattern: MonthlyPatternDto;

  @ApiProperty({ type: HourlyPatternDto })
  hourlyPattern: HourlyPatternDto;

  @ApiProperty({ type: [CorrelationDto] })
  correlations: CorrelationDto[];

  @ApiProperty({
    example: [
      'Your mood tends to be highest on weekends',
      'Evening entries show lower ratings',
    ],
  })
  insights: string[];
}

export class PaginatedMoodPatternsResponseDto {
  @ApiProperty({ type: [MoodPatternResponseDto] })
  patterns: MoodPatternResponseDto[];

  @ApiProperty({ type: 'object' })
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
