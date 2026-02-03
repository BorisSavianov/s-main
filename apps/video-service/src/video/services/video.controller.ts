import { Public } from 'apps/user-service/src/auth/decorators/public.decorator';
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
  Req,
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
import { GetUser } from 'apps/user-service/src/auth/decorators/get-user.decorator';
import { InternalAuth } from 'apps/user-service/src/auth/decorators/internal-auth.decorator';


@ApiTags('Video')
@Controller('video')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @InternalAuth()
  @Post('rooms')
  @ApiOperation({ summary: 'Create a new video room' })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  async createRoom(@Body() createRoomDto: CreateRoomDto, @GetUser('userId') userId: string) {
    return this.videoService.createRoom(createRoomDto, userId);
  }
  
    
  @Post('rooms/:roomId/join')
  @ApiOperation({ summary: 'Join a video room' })
  @ApiResponse({ status: 200, description: 'Successfully joined room' })
  async joinRoom(
    @Param('roomId') roomId: string,
    @Body() joinRoomDto: JoinRoomDto,
    @GetUser('userId') userId: string,
  ) {
    return this.videoService.joinRoom(roomId, joinRoomDto, userId);
  }

  @InternalAuth()
  @Delete('rooms/:roomId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a video room' })
  @ApiResponse({ status: 204, description: 'Successfully left room' })
  async leaveRoom(@Param('roomId') roomId: string, @GetUser('userId') userId: string) {
    await this.videoService.leaveRoom(roomId, userId);
  }

  @InternalAuth()
  @Delete('rooms/:roomId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End a video room' })
  @ApiResponse({ status: 204, description: 'Room ended successfully' })
  async endRoom(@Param('roomId') roomId: string, @GetUser('userId') userId: string) {
    await this.videoService.endRoom(roomId, userId);
  }

  @InternalAuth()
  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Get room details' })
  @ApiResponse({ status: 200, description: 'Room details retrieved' })
  async getRoomDetails(@Param('roomId') roomId: string, @GetUser('userId') userId: string) {
    return this.videoService.getRoomDetails(roomId, userId);
  }

  @Get('rooms/:roomId/stats')
  @ApiOperation({ summary: 'Get room statistics' })
  @ApiResponse({ status: 200, description: 'Room statistics retrieved' })
  async getRoomStats(@Param('roomId') roomId: string) {
    return this.videoService.getRoomStats(roomId);
  }

  @InternalAuth()
  @Put('rooms/:roomId/media')
  @ApiOperation({ summary: 'Update participant media state' })
  @ApiResponse({ status: 200, description: 'Media state updated' })
  async updateMediaState(
    @Param('roomId') roomId: string,
    @Body() updateMediaStateDto: UpdateMediaStateDto,
    @GetUser('userId') userId: string,
  ) {
    await this.videoService.updateParticipantMedia(
      roomId,
      userId,
      updateMediaStateDto,
    );
    return { message: 'Media state updated successfully' };
  }

  @InternalAuth()
  @Post('rooms/:roomId/signal')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Handle WebRTC signaling' })
  @ApiResponse({ status: 204, description: 'Signal processed' })
  async handleSignaling(
    @Param('roomId') roomId: string,
    @Body() signalData: any,
    @GetUser('userId') userId: string,
  ) {
    await this.videoService.handleWebRTCSignaling(
      roomId,
      userId,
      signalData,
    );
  }


  @InternalAuth()
  @Public()
  @Get('rooms/:roomId/validate')
  @ApiOperation({ summary: 'Validate room access' })
  @ApiResponse({ status: 200, description: 'Room access validation result' })
  async validateRoomAccess(
    @Param('roomId') roomId: string,
    @GetUser('userId') userId: string,
    @Query('accessCode') accessCode?: string,
  ) {
    try {
      const room = await this.videoService.getRoomDetails(
        roomId,
        userId,
      );

      console.log('Room:', JSON.stringify(room));

      const hasAccess =
        room.hostUserId === userId ||
        accessCode === room.accessCode ||
        accessCode === room.moderatorCode;

      console.log('Has access:', hasAccess);
      console.log('Room status:', room.status);
      console.log('Participant count:', room.activeParticipantCount);
      console.log('Max participants:', room.maxParticipants);
      console.log('Is full:', room.activeParticipantCount >= room.maxParticipants);
      console.log('Access code:', accessCode);

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
  @InternalAuth()
  @Get('meetings/:meetingId/room')
  @ApiOperation({ summary: 'Get room for a meeting' })
  @ApiResponse({ status: 200, description: 'Meeting room details' })
  async getMeetingRoom(
    @Param('meetingId') meetingId: string,
    @GetUser('userId') userId: string,
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
        userId,
      );
    } catch (error) {
      throw new BadRequestException(`Meeting room not found: ${error.message}`);
    }
  }

  @InternalAuth()
  @Post('meetings/:meetingId/room')
  @ApiOperation({ summary: 'Create room for a meeting' })
  @ApiResponse({ status: 201, description: 'Meeting room created' })
  async createMeetingRoom(
    @Param('meetingId') meetingId: string,
    @Body() createRoomDto: CreateRoomDto,
    @GetUser('userId') userId: string,
  ) {
    const roomDto = {
      ...createRoomDto,
      meetingId,
    };

    return this.videoService.createRoom(roomDto, userId);
  }
}
