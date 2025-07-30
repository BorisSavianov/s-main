// apps/user-service/src/users/dto/users.dto.ts
import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsPhoneNumber,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { UserRole } from '../../database/entities/user.entity';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: '1990-01-01' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'male',
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/profile.jpg' })
  @IsOptional()
  @IsString()
  profilePictureUrl?: string;
}

export class UserSearchDto {
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

  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 'user', enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isVerified?: boolean;
}

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'John' })
  firstName?: string;

  @ApiProperty({ example: 'Doe' })
  lastName?: string;

  @ApiProperty({ example: 'user', enum: UserRole })
  role: UserRole;

  @ApiProperty({ example: '+1234567890' })
  phone?: string;

  @ApiProperty({ example: '1990-01-01' })
  dateOfBirth?: string;

  @ApiProperty({ example: 'male' })
  gender?: string;

  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ example: 'https://example.com/profile.jpg' })
  profilePictureUrl?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  lastLogin?: string;

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

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  users: UserResponseDto[];

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
