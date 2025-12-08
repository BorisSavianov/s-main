// apps/video-service/src/video/dtos/recording.dto.ts
import { IsBoolean, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RecordingFormat {
  WEBM = 'webm',
  MP4 = 'mp4',
}

export enum RecordingQuality {
  LOW = 'low',      // 480p
  MEDIUM = 'medium', // 720p
  HIGH = 'high',    // 1080p
}

export class StartRecordingDto {
  @ApiProperty({ description: 'Room ID to start recording' })
  @IsString()
  roomId: string;

  @ApiPropertyOptional({ description: 'Recording format', enum: RecordingFormat })
  @IsEnum(RecordingFormat)
  @IsOptional()
  format?: RecordingFormat = RecordingFormat.WEBM;

  @ApiPropertyOptional({ description: 'Recording quality', enum: RecordingQuality })
  @IsEnum(RecordingQuality)
  @IsOptional()
  quality?: RecordingQuality = RecordingQuality.MEDIUM;

  @ApiPropertyOptional({ description: 'Include participant audio' })
  @IsBoolean()
  @IsOptional()
  includeAudio?: boolean = true;

  @ApiPropertyOptional({ description: 'Include video streams' })
  @IsBoolean()
  @IsOptional()
  includeVideo?: boolean = true;

  @ApiPropertyOptional({ description: 'Include screen shares' })
  @IsBoolean()
  @IsOptional()
  includeScreenShare?: boolean = true;
}

export class StopRecordingDto {
  @ApiProperty({ description: 'Room ID to stop recording' })
  @IsString()
  roomId: string;

  @ApiPropertyOptional({ description: 'Reason for stopping recording' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RecordingStatusDto {
  @ApiProperty({ description: 'Recording ID' })
  id: string;

  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ApiProperty({ description: 'Recording status' })
  status: 'pending' | 'recording' | 'processing' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'Recording duration in seconds' })
  duration?: number;

  @ApiPropertyOptional({ description: 'Recording URL (when completed)' })
  url?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  size?: number;
}
