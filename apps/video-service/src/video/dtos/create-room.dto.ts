// apps/video-service/src/video/dto/create-room.dto.ts
import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsString,
  IsObject,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RoomSettingsDto {
  @IsOptional()
  @IsBoolean()
  audioEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  videoEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  screenShareEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  muteOnEntry?: boolean;

  @IsOptional()
  @IsBoolean()
  backgroundBlurEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(25)
  maxVideosVisible?: number;
}

export class CreateRoomDto {
  @IsOptional()
  @IsString()
  meetingId?: string;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(100)
  maxParticipants?: number;

  @IsOptional()
  @IsBoolean()
  isRecordingEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoomSettingsDto)
  roomSettings?: RoomSettingsDto;

  @IsOptional()
  @IsObject()
  metadata?: {
    topic?: string;
    agenda?: string[];
    tags?: string[];
    customData?: Record<string, any>;
  };
}
