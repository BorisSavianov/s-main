// apps/video-service/src/video/dtos/update-media-state.dto.ts
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMediaStateDto {
  @IsOptional()
  @IsBoolean()
  video?: boolean;

  @IsOptional()
  @IsBoolean()
  audio?: boolean;

  @IsOptional()
  @IsBoolean()
  screenShare?: boolean;
}
