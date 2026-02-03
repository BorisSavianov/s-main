// src/scheduling/dto/update-meeting-room.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateMeetingRoomDto {
  @ApiPropertyOptional({
    description: 'Video room ID',
    example: 'room_1700000000000_abcd1234',
  })
  @IsOptional()
  @IsString()
  videoRoomId?: string;

  @ApiPropertyOptional({
    description: 'Video room URL',
    example: 'https://video.example.com/room/room_1700000000000_abcd1234',
  })
  @IsOptional()
  @IsString()
  videoRoomUrl?: string;

  @ApiPropertyOptional({
    description: 'Access code for the video room',
    example: 'A1B2C3',
  })
  @IsOptional()
  @IsString()
  accessCode?: string;
}
