// apps/user-service/src/counselors/dto/counselors.dto.ts
import {
  IsString,
  IsArray,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreateCounselorProfileDto {
  @ApiPropertyOptional({ example: 'PSY-2024-001' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'License number cannot be empty' })
  licenseNumber?: string;

  @ApiProperty({ example: ['Anxiety', 'Depression', 'Trauma'] })
  @IsArray()
  @IsString({ each: true })
  specialties: string[];

  @ApiProperty({
    example: ['PhD in Clinical Psychology', 'Licensed Clinical Psychologist'],
  })
  @IsArray()
  @IsString({ each: true })
  qualifications: string[];

  @ApiProperty({ example: 8 })
  @IsNumber()
  @Min(0)
  @Max(50)
  experienceYears: number;

  @ApiProperty({ example: 120.0 })
  @IsNumber()
  @Min(0)
  hourlyRate: number;

  @ApiProperty({
    example:
      'Experienced clinical psychologist specializing in anxiety and depression.',
  })
  @IsString()
  @MaxLength(1000)
  bio: string;

  @ApiProperty({ example: ['English', 'Spanish'] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];
}

export class UpdateCounselorProfileDto {
  @ApiPropertyOptional({ example: 'PSY-2024-001' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'License number cannot be empty' })
  licenseNumber?: string;

  @ApiPropertyOptional({ example: ['Anxiety', 'Depression', 'Trauma'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({
    example: ['PhD in Clinical Psychology', 'Licensed Clinical Psychologist'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifications?: string[];

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  experienceYears?: number;

  @ApiPropertyOptional({ example: 120.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    example:
      'Experienced clinical psychologist specializing in anxiety and depression.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ example: ['English', 'Spanish'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class CounselorSearchDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'anxiety' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 'Depression' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 4.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: 150.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRate?: number;

  @ApiPropertyOptional({ example: 'English' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isAvailable?: boolean;
}

export class CounselorResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'uuid-here' })
  userId: string;

  @ApiProperty({ example: 'Dr. Jane' })
  firstName?: string;

  @ApiProperty({ example: 'Smith' })
  lastName?: string;

  @ApiProperty({ example: 'jane.smith@example.com' })
  email?: string;

  @ApiProperty({ example: 'https://example.com/profile.jpg' })
  profilePictureUrl?: string;

  @ApiProperty({ example: 'PSY-2024-001' })
  licenseNumber?: string;

  @ApiProperty({ example: ['Anxiety', 'Depression', 'Trauma'] })
  specialties: string[];

  @ApiProperty({ example: ['PhD in Clinical Psychology'] })
  qualifications: string[];

  @ApiProperty({ example: 8 })
  experienceYears: number;

  @ApiProperty({ example: 120.0 })
  hourlyRate: number;

  @ApiProperty({ example: 'Experienced clinical psychologist...' })
  bio: string;

  @ApiProperty({ example: ['English', 'Spanish'] })
  languages: string[];

  @ApiProperty({ example: true })
  isAvailable: boolean;

  @ApiProperty({ example: 4.8 })
  rating: number;

  @ApiProperty({ example: 25 })
  totalReviews: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: string;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 10 })
  pages: number;
}

export class PaginatedCounselorsResponseDto {
  @ApiProperty({ type: [CounselorResponseDto] })
  counselors: CounselorResponseDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

export class ApiResponseDto<T = any> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional({ example: ['Validation error message'] })
  errors?: string[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;
}
