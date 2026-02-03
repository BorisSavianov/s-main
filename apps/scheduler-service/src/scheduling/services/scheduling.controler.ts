// src/scheduling/controllers/scheduling.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'apps/user-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'apps/user-service/src/auth/guards/roles.guard';
import { Roles } from 'apps/user-service/src/auth/decorators/roles.decorator';
import { GetUser } from 'apps/user-service/src/auth/decorators/get-user.decorator';
import { UserRole } from 'apps/user-service/src/database/entities/user.entity';
import { SchedulingService } from '../services/scheduling.service';
import { AvailabilityService } from '../services/availability.service';
import { CreateMeetingDto } from '../dto/create-meeting.dto';
import { UpdateMeetingDto } from '../dto/update-meeting.dto';
import { UpdateMeetingRoomDto } from '../dto/update-meeting-room.dto';
import { SchedulingQueryDto } from '../dto/scheduling-query.dto';
import { CreateTimeSlotDto } from '../dto/create-time-slot.dto';
import { EnhancedSchedulingService } from '../services/enhanced-scheduling.service';
import { VideoIntegrationService } from '../services/video-integration.service';
import { InternalAuth } from 'apps/user-service/src/auth/decorators/internal-auth.decorator';

@ApiTags('Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling')
export class SchedulingController {
  constructor(
    private readonly enhancedSchedulingService: EnhancedSchedulingService,
    private readonly schedulingService: SchedulingService,
    private readonly availabilityService: AvailabilityService,
    private readonly videoIntegrationService: VideoIntegrationService,
  ) {}

  @Post('meetings')
  @ApiOperation({
    summary: 'Create meeting',
    description: 'Schedules a new meeting with a counselor.',
  })
  @ApiBody({ type: CreateMeetingDto })
  @ApiResponse({
    status: 201,
    description: 'Meeting created',
    type: CreateMeetingDto,
  })
  async createMeetingWithRoom(
    @GetUser('userId') userId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.enhancedSchedulingService.createMeetingWithRoom(userId, dto);
  }

  @Get('meetings')
  @ApiOperation({
    summary: 'List meetings',
    description: 'Returns paginated meetings for current user.',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter from date (ISO)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter to date (ISO)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'meetingType',
    required: false,
    type: String,
    description: 'Filter by type',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Meetings returned',
    type: [CreateMeetingDto],
  })
  async getMeetings(
    @GetUser('userId') userId: string,
    @Query() query: SchedulingQueryDto,
  ) {
    return this.schedulingService.getMeetings(userId, query);
  }

  @Get('meetings/upcoming')
  @ApiOperation({
    summary: 'Upcoming meetings',
    description: 'Fetch next upcoming meetings, optional limit.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of meetings',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming meetings',
    type: [CreateMeetingDto],
  })
  async getUpcomingMeetings(
    @GetUser('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.schedulingService.getUpcomingMeetings(userId, limit);
  }

  @Get('meetings/statistics')
  @ApiOperation({
    summary: 'Meeting stats',
    description: 'Summary statistics of meetings for user/provider.',
  })
  @ApiResponse({ status: 200, description: 'Statistics object' })
  async getMeetingStatistics(
    @GetUser('userRole') role: UserRole,
    @GetUser('userId') userId: string,
  ) {
    const isProvider = role === UserRole.COUNSELOR;
    return this.schedulingService.getMeetingStatistics(userId, isProvider);
  }

  @InternalAuth()
  @Get('meetings/:id')
  @ApiOperation({
    summary: 'Get meeting with room status',
    description: 'Returns meeting details including video room status if applicable.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiResponse({
    status: 200,
    description: 'Meeting found',
    type: CreateMeetingDto,
  })
  async getMeetingById(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
  ) {
    return this.enhancedSchedulingService.getMeetingWithRoomStatus(id, userId);
  }

  @Put('meetings/:id')
  @ApiOperation({
    summary: 'Update meeting',
    description: 'Updates meeting and syncs changes with video room.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiBody({ type: UpdateMeetingDto })
  @ApiResponse({
    status: 200,
    description: 'Meeting updated',
    type: UpdateMeetingDto,
  })
  async updateMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.enhancedSchedulingService.updateMeetingWithRoom(id, userId, dto);
  }


  @Put('meetings/:id/confirm')
  @ApiOperation({
    summary: 'Confirm meeting',
    description: 'Mark a pending meeting as confirmed.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiResponse({ status: 200, description: 'Meeting confirmed' })
  async confirmMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
  ) {
    return this.schedulingService.confirmMeeting(id, userId);
  }

  @Put('meetings/:id/start')
  @ApiOperation({
    summary: 'Start meeting',
    description: 'Marks meeting as in-progress.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiResponse({ status: 200, description: 'Meeting started' })
  async startMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
  ) {
    return this.enhancedSchedulingService.startMeeting(id, userId);
  }

  @Put('meetings/:id/complete')
  @ApiOperation({
    summary: 'Complete meeting',
    description: 'Marks meeting as completed and retrieves room statistics.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiResponse({ status: 200, description: 'Meeting completed' })
  async completeMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
  ) {
    return this.enhancedSchedulingService.completeMeeting(id, userId);
  }

  @Put('meetings/:id/cancel')
  @ApiOperation({
    summary: 'Cancel meeting',
    description: 'Cancels meeting and ends associated video room.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiQuery({
    name: 'reason',
    required: false,
    type: String,
    description: 'Cancellation reason',
  })
  @ApiResponse({ status: 200, description: 'Meeting cancelled' })
  async cancelMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
    @Query('reason') reason?: string,
  ) {
    return this.enhancedSchedulingService.cancelMeetingWithRoom(id, userId, reason);
  }

  @InternalAuth()
  @Post('meetings/:id/ensure-room')
  @ApiOperation({
    summary: 'Ensure video room exists',
    description: 'Creates video room if it doesn\'t exist (lazy creation).',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiResponse({ status: 200, description: 'Video room ensured' })
  async ensureVideoRoom(@Param('id', ParseUUIDPipe) id: string) {
    const roomUrl = await this.enhancedSchedulingService.ensureVideoRoom(id);
    return { roomUrl };
  }

  @InternalAuth()
  @Put('meetings/:id/video-room')
  @ApiOperation({
    summary: 'Update meeting with video room details',
    description: 'Internal endpoint to sync meeting room details from video service.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiBody({ type: UpdateMeetingRoomDto })
  @ApiResponse({ status: 200, description: 'Meeting room details updated' })
  async updateMeetingRoomDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMeetingRoomDto,
  ) {
    return this.schedulingService.updateMeetingRoomDetails(id, body);
  }

  @Get('meetings/:id/room-access')
  @ApiOperation({
    summary: 'Validate room access',
    description: 'Checks if user can access the meeting\'s video room.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Meeting ID' })
  @ApiQuery({
    name: 'accessCode',
    required: false,
    type: String,
    description: 'Access code for video room',
  })
  @ApiResponse({ status: 200, description: 'Room access validated' })
  async validateRoomAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
    @Query('accessCode') accessCode?: string,
  ) {
    const meeting = await this.schedulingService.getMeetingById(id, userId);
    
    if (!meeting.meetingRoomId) {
      return { valid: false, error: 'No video room associated with this meeting' };
    }

    const valid = await this.videoIntegrationService.validateRoomAccess(
      meeting.meetingRoomId,
      userId,
      accessCode,
    );

    return {
      valid,
      roomId: meeting.meetingRoomId,
      roomUrl: meeting.meetingRoomUrl,
    };
  }

  @Post('time-slots')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({
    summary: 'Create time slot',
    description: 'Counselors only: define available times.',
  })
  @ApiBody({ type: CreateTimeSlotDto })
  @ApiResponse({
    status: 201,
    description: 'Time slot created',
    type: CreateTimeSlotDto,
  })
  async createTimeSlot(
    @GetUser('userId') userId: string,
    @Body() dto: CreateTimeSlotDto,
  ) {
    return this.schedulingService.createTimeSlot(userId, dto);
  }

  @Get('time-slots')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({
    summary: 'List counselor slots',
    description: 'Fetch slots for logged-in counselor, optional date.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Filter by date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Time slots returned',
    type: [CreateTimeSlotDto],
  })
  async getCounselorTimeSlots(
    @GetUser('userId') userId: string,
    @Query('date') date?: string,
  ) {
    return this.schedulingService.getCounselorTimeSlots(userId, date);
  }

  @Put('time-slots/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({
    summary: 'Update time slot',
    description: 'Modify an existing counselor time slot.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Time slot ID' })
  @ApiBody({ type: CreateTimeSlotDto })
  @ApiResponse({
    status: 200,
    description: 'Time slot updated',
    type: CreateTimeSlotDto,
  })
  async updateTimeSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
    @Body() dto: Partial<CreateTimeSlotDto>,
  ) {
    return this.schedulingService.updateTimeSlot(id, userId, dto);
  }

  @Delete('time-slots/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({
    summary: 'Delete time slot',
    description: 'Remove a time slot by ID.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Time slot ID' })
  @ApiResponse({ status: 200, description: 'Time slot deleted' })
  async deleteTimeSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
  ) {
    await this.schedulingService.deleteTimeSlot(id, userId);
    return { message: 'Time slot deleted' };
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get preferences',
    description: 'Retrieve current user scheduling preferences.',
  })
  @ApiResponse({ status: 200, description: 'Preferences returned' })
  async getSchedulingPreferences(@GetUser('userId') userId: string) {
    return this.schedulingService.getSchedulingPreferences(userId);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Update preferences',
    description: 'Modify user scheduling preferences.',
  })
  @ApiBody({
    description: 'Partial preferences object',
    schema: {
      example: { preferredMeetingType: 'ONLINE', enableReminders: true },
    },
  })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  async updateSchedulingPreferences(
    @GetUser('userId') userId: string,
    @Body() dto: any,
  ) {
    return this.schedulingService.updateSchedulingPreferences(userId, dto);
  }

  @Put('reminders/:id/acknowledge')
  @ApiOperation({
    summary: 'Acknowledge reminder',
    description: 'Mark a reminder as read.',
  })
  @ApiParam({ name: 'id', type: 'uuid', description: 'Reminder ID' })
  @ApiResponse({ status: 200, description: 'Reminder acknowledged' })
  async acknowledgeReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('userId') userId: string,
  ) {
    await this.schedulingService.acknowledgeReminder(id, userId);
    return { message: 'Reminder acknowledged' };
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Get counselor availability',
    description: 'Find available slots for a counselor.',
  })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Availability slots returned' })
  async getAvailability(
    @Query('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    return this.availabilityService.generateAvailabilitySlots(
      userId,
      new Date(startDate),
      new Date(endDate),
      60,
      startTime,
      endTime,
    );
  }

  @Get('health/video-service')
  @ApiOperation({
    summary: 'Check video service health',
    description: 'Verifies connectivity to video service.',
  })
  async checkVideoServiceHealth() {
    const healthy = await this.videoIntegrationService.checkVideoServiceHealth();
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      service: 'video-service',
      timestamp: new Date().toISOString(),
    };
  }
}
