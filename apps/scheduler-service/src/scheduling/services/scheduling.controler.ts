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
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'apps/user-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'apps/user-service/src/auth/guards/roles.guard';
import { Roles } from 'apps/user-service/src/auth/decorators/roles.decorator';
import { UserRole } from 'apps/user-service/src/database/entities/user.entity';
import { SchedulingService } from '../services/scheduling.service';
import { CreateMeetingDto } from '../dto/create-meeting.dto';
import { UpdateMeetingDto } from '../dto/update-meeting.dto';
import { SchedulingQueryDto } from '../dto/scheduling-query.dto';
import { CreateTimeSlotDto } from '../dto/create-time-slot.dto';

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // Meeting endpoints
  @Post('meetings')
  @ApiOperation({ summary: 'Create a new meeting' })
  @ApiResponse({ status: 201, description: 'Meeting created successfully' })
  async createMeeting(@Req() req, @Body() createMeetingDto: CreateMeetingDto) {
    return await this.schedulingService.createMeeting(
      req.user.id,
      createMeetingDto,
    );
  }

  @Get('meetings')
  @ApiOperation({ summary: 'Get meetings for the current user' })
  @ApiResponse({ status: 200, description: 'Meetings retrieved successfully' })
  async getMeetings(@Req() req, @Query() query: SchedulingQueryDto) {
    return await this.schedulingService.getMeetings(req.user.id, query);
  }

  @Get('meetings/upcoming')
  @ApiOperation({ summary: 'Get upcoming meetings' })
  @ApiResponse({
    status: 200,
    description: 'Upcoming meetings retrieved successfully',
  })
  async getUpcomingMeetings(@Req() req, @Query('limit') limit?: number) {
    return await this.schedulingService.getUpcomingMeetings(req.user.id, limit);
  }

  @Get('meetings/statistics')
  @ApiOperation({ summary: 'Get meeting statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getMeetingStatistics(@Req() req) {
    const isProvider = req.user.role === UserRole.COUNSELOR;
    return await this.schedulingService.getMeetingStatistics(
      req.user.id,
      isProvider,
    );
  }

  @Get('meetings/:id')
  @ApiOperation({ summary: 'Get a specific meeting' })
  @ApiResponse({ status: 200, description: 'Meeting retrieved successfully' })
  async getMeetingById(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return await this.schedulingService.getMeetingById(id, req.user.id);
  }

  @Put('meetings/:id')
  @ApiOperation({ summary: 'Update a meeting' })
  @ApiResponse({ status: 200, description: 'Meeting updated successfully' })
  async updateMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
    @Body() updateMeetingDto: UpdateMeetingDto,
  ) {
    return await this.schedulingService.updateMeeting(
      id,
      req.user.id,
      updateMeetingDto,
    );
  }

  @Put('meetings/:id/confirm')
  @ApiOperation({ summary: 'Confirm a meeting' })
  @ApiResponse({ status: 200, description: 'Meeting confirmed successfully' })
  async confirmMeeting(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return await this.schedulingService.confirmMeeting(id, req.user.id);
  }

  @Put('meetings/:id/cancel')
  @ApiOperation({ summary: 'Cancel a meeting' })
  @ApiResponse({ status: 200, description: 'Meeting cancelled successfully' })
  async cancelMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
    @Body('reason') reason?: string,
  ) {
    return await this.schedulingService.cancelMeeting(id, req.user.id, reason);
  }

  // Time slot endpoints (for counselors)
  @Post('time-slots')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({ summary: 'Create a time slot (counselors only)' })
  @ApiResponse({ status: 201, description: 'Time slot created successfully' })
  async createTimeSlot(
    @Req() req,
    @Body() createTimeSlotDto: CreateTimeSlotDto,
  ) {
    return await this.schedulingService.createTimeSlot(
      req.user.id,
      createTimeSlotDto,
    );
  }

  @Get('time-slots')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({ summary: 'Get time slots for counselor' })
  @ApiResponse({
    status: 200,
    description: 'Time slots retrieved successfully',
  })
  async getCounselorTimeSlots(@Req() req, @Query('date') date?: string) {
    return await this.schedulingService.getCounselorTimeSlots(
      req.user.id,
      date,
    );
  }

  @Put('time-slots/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({ summary: 'Update a time slot' })
  @ApiResponse({ status: 200, description: 'Time slot updated successfully' })
  async updateTimeSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
    @Body() updateData: Partial<CreateTimeSlotDto>,
  ) {
    return await this.schedulingService.updateTimeSlot(
      id,
      req.user.id,
      updateData,
    );
  }

  @Delete('time-slots/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR)
  @ApiOperation({ summary: 'Delete a time slot' })
  @ApiResponse({ status: 200, description: 'Time slot deleted successfully' })
  async deleteTimeSlot(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    await this.schedulingService.deleteTimeSlot(id, req.user.id);
    return { message: 'Time slot deleted successfully' };
  }

  // Availability endpoints
  @Get('availability/:counselorId')
  @ApiOperation({ summary: 'Get counselor availability' })
  @ApiResponse({
    status: 200,
    description: 'Availability retrieved successfully',
  })
  async getCounselorAvailability(
    @Param('counselorId', ParseUUIDPipe) counselorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return await this.schedulingService.getCounselorAvailability(
      counselorId,
      startDate,
      endDate,
    );
  }

  @Get('available-slots/:counselorId')
  @ApiOperation({ summary: 'Get available time slots for booking' })
  @ApiResponse({
    status: 200,
    description: 'Available slots retrieved successfully',
  })
  async getAvailableTimeSlots(
    @Param('counselorId', ParseUUIDPipe) counselorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return await this.schedulingService.getAvailableTimeSlots(
      counselorId,
      startDate,
      endDate,
    );
  }

  // Preferences endpoints
  @Get('preferences')
  @ApiOperation({ summary: 'Get user scheduling preferences' })
  @ApiResponse({
    status: 200,
    description: 'Preferences retrieved successfully',
  })
  async getSchedulingPreferences(@Req() req) {
    return await this.schedulingService.getSchedulingPreferences(req.user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update scheduling preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updateSchedulingPreferences(@Req() req, @Body() updateData: any) {
    return await this.schedulingService.updateSchedulingPreferences(
      req.user.id,
      updateData,
    );
  }

  // Reminder endpoints
  @Put('reminders/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a reminder' })
  @ApiResponse({
    status: 200,
    description: 'Reminder acknowledged successfully',
  })
  async acknowledgeReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
  ) {
    await this.schedulingService.acknowledgeReminder(id, req.user.id);
    return { message: 'Reminder acknowledged successfully' };
  }
}
