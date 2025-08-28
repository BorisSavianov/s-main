// apps/video-service/src/video/dtos/join-room.dto.ts
import { IsOptional, IsString, IsObject, IsBoolean } from 'class-validator';

export class JoinRoomDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  accessCode?: string;

  @IsOptional()
  @IsObject()
  deviceCapabilities?: {
    video?: boolean;
    audio?: boolean;
    screenShare?: boolean;
    recording?: boolean;
  };

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
