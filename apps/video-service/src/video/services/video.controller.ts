// apps/video-service/src/video/services/video.controller.ts
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'apps/user-service/src/auth/guards/jwt-auth.guard';
import { VideoService } from '../services/video.service';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { JoinRoomDto } from '../dtos/join-room.dto';
import { UpdateMediaStateDto } from '../dtos/update-media-state.dto';

@ApiTags('Video')
@Controller('video')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('rooms')
  @ApiOperation({ summary: 'Create a new video room' })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  async createRoom(@Body() createRoomDto: CreateRoomDto, @Request() req: any) {
    return this.videoService.createRoom(createRoomDto, req.user.id);
  }

  @Post('rooms/:roomId/join')
  @ApiOperation({ summary: 'Join a video room' })
  @ApiResponse({ status: 200, description: 'Successfully joined room' })
  async joinRoom(
    @Param('roomId') roomId: string,
    @Body() joinRoomDto: JoinRoomDto,
    @Request() req: any,
  ) {
    return this.videoService.joinRoom(roomId, joinRoomDto, req.user.id);
  }

  @Delete('rooms/:roomId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a video room' })
  @ApiResponse({ status: 204, description: 'Successfully left room' })
  async leaveRoom(@Param('roomId') roomId: string, @Request() req: any) {
    await this.videoService.leaveRoom(roomId, req.user.id);
  }

  @Delete('rooms/:roomId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End a video room' })
  @ApiResponse({ status: 204, description: 'Room ended successfully' })
  async endRoom(@Param('roomId') roomId: string, @Request() req: any) {
    await this.videoService.endRoom(roomId, req.user.id);
  }

  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Get room details' })
  @ApiResponse({ status: 200, description: 'Room details retrieved' })
  async getRoomDetails(@Param('roomId') roomId: string, @Request() req: any) {
    return this.videoService.getRoomDetails(roomId, req.user.id);
  }

  @Get('rooms/:roomId/stats')
  @ApiOperation({ summary: 'Get room statistics' })
  @ApiResponse({ status: 200, description: 'Room statistics retrieved' })
  async getRoomStats(@Param('roomId') roomId: string) {
    return this.videoService.getRoomStats(roomId);
  }

  @Put('rooms/:roomId/media')
  @ApiOperation({ summary: 'Update participant media state' })
  @ApiResponse({ status: 200, description: 'Media state updated' })
  async updateMediaState(
    @Param('roomId') roomId: string,
    @Body() updateMediaStateDto: UpdateMediaStateDto,
    @Request() req: any,
  ) {
    await this.videoService.updateParticipantMedia(
      roomId,
      req.user.id,
      updateMediaStateDto,
    );
    return { message: 'Media state updated successfully' };
  }

  @Post('rooms/:roomId/signal')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Handle WebRTC signaling' })
  @ApiResponse({ status: 204, description: 'Signal processed' })
  async handleSignaling(
    @Param('roomId') roomId: string,
    @Body() signalData: any,
    @Request() req: any,
  ) {
    await this.videoService.handleWebRTCSignaling(
      roomId,
      req.user.id,
      signalData,
    );
  }

  // Room validation endpoint (for quick checks)
  @Get('rooms/:roomId/validate')
  @ApiOperation({ summary: 'Validate room access' })
  @ApiResponse({ status: 200, description: 'Room access validation result' })
  async validateRoomAccess(
    @Param('roomId') roomId: string,
    @Query('accessCode') accessCode?: string,
    @Request() req?: any,
  ) {
    try {
      const room = await this.videoService.getRoomDetails(
        roomId,
        req?.user?.id,
      );

      const hasAccess =
        room.hostUserId === req?.user?.id ||
        accessCode === room.accessCode ||
        accessCode === room.moderatorCode;

      return {
        valid: hasAccess,
        roomStatus: room.status,
        participantCount: room.activeParticipantCount,
        maxParticipants: room.maxParticipants,
        isFull: room.activeParticipantCount >= room.maxParticipants,
        requiresAccessCode: !hasAccess && !!accessCode,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  // Meeting integration endpoints
  @Get('meetings/:meetingId/room')
  @ApiOperation({ summary: 'Get room for a meeting' })
  @ApiResponse({ status: 200, description: 'Meeting room details' })
  async getMeetingRoom(
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    // This would integrate with the scheduling service
    // to find the room associated with a meeting
    try {
      const rooms = await this.videoService['roomRepository'].find({
        where: { meetingId },
        relations: ['participants'],
      });

      const activeRoom = rooms.find((r) => r.status === 'active') || rooms[0];

      if (!activeRoom) {
        throw new BadRequestException('No room found for this meeting');
      }

      return await this.videoService.getRoomDetails(
        activeRoom.roomId,
        req.user.id,
      );
    } catch (error) {
      throw new BadRequestException(`Meeting room not found: ${error.message}`);
    }
  }

  @Post('meetings/:meetingId/room')
  @ApiOperation({ summary: 'Create room for a meeting' })
  @ApiResponse({ status: 201, description: 'Meeting room created' })
  async createMeetingRoom(
    @Param('meetingId') meetingId: string,
    @Body() createRoomDto: CreateRoomDto,
    @Request() req: any,
  ) {
    const roomDto = {
      ...createRoomDto,
      meetingId,
    };

    return this.videoService.createRoom(roomDto, req.user.id);
  }
}
