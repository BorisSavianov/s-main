// apps/mood-service/src/mood-triggers/dto/mood-triggers.dto.ts
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

export class CreateMoodTriggerDto {
  @ApiProperty({ example: 'work stress' })
  @IsString()
  @MaxLength(100)
  triggerName: string;

  @ApiPropertyOptional({ example: 'work' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  triggerCategory?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  impactScore?: number;
}

export class UpdateMoodTriggerDto {
  @ApiPropertyOptional({ example: 'work' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  triggerCategory?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  impactScore?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MoodTriggerSearchDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'work' })
  @IsOptional()
  @IsString()
  triggerCategory?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MoodTriggerResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'uuid-here' })
  userId: string;

  @ApiProperty({ example: 'work stress' })
  triggerName: string;

  @ApiPropertyOptional({ example: 'work' })
  triggerCategory?: string;

  @ApiPropertyOptional({ example: 7 })
  impactScore?: number;

  @ApiProperty({ example: 15 })
  frequencyCount: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  updatedAt: string;
}
