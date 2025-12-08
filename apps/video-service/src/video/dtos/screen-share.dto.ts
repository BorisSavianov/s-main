// apps/video-service/src/video/dtos/screen-share.dto.ts
import { IsBoolean, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ScreenShareSettingsDto {
  @ApiPropertyOptional({ description: 'Include system audio in screen share' })
  @IsBoolean()
  @IsOptional()
  includeAudio?: boolean;

  @ApiPropertyOptional({ description: 'Preferred display surface type' })
  @IsOptional()
  displaySurface?: 'monitor' | 'window' | 'browser';

  @ApiPropertyOptional({ description: 'Cursor visibility setting' })
  @IsOptional()
  cursor?: 'always' | 'motion' | 'never';
}

export class StartScreenShareDto {
  @ApiProperty({ description: 'Room ID for screen sharing' })
  roomId: string;

  @ApiPropertyOptional({ description: 'Screen share settings' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ScreenShareSettingsDto)
  settings?: ScreenShareSettingsDto;
}

export class StopScreenShareDto {
  @ApiProperty({ description: 'Room ID to stop screen sharing' })
  roomId: string;
}
