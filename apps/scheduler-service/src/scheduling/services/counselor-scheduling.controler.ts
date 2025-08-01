// src/scheduling/controllers/counselor-scheduling.controller.ts
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
import { AvailabilityService } from '../services/availability.service';
import { CreateTimeSlotDto } from '../dto/create-time-slot.dto';

@ApiTags('counselor-scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COUNSELOR)
@Controller('counselor/scheduling')
export class CounselorSchedulingController {
  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Post('bulk-time-slots')
  @ApiOperation({ summary: 'Create multiple time slots' })
  @ApiResponse({ status: 201, description: 'Time slots created successfully' })
  async createBulkTimeSlots(
    @Req() req,
    @Body()
    createBulkDto: {
      startDate: string;
      endDate: string;
      dailySchedule: { startTime: string; endTime: string; duration: number }[];
      excludeWeekends?: boolean;
    },
  ) {
    const { startDate, endDate, dailySchedule, excludeWeekends } =
      createBulkDto;

    return await this.availabilityService.bulkCreateTimeSlots(
      req.user.id,
      new Date(startDate),
      new Date(endDate),
      dailySchedule,
      excludeWeekends,
    );
  }

  @Get('availability-report')
  @ApiOperation({ summary: 'Get detailed availability report' })
  @ApiResponse({
    status: 200,
    description: 'Availability report generated successfully',
  })
  async getAvailabilityReport(
    @Req() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('slotDuration') slotDuration?: number,
  ) {
    return await this.availabilityService.generateAvailabilitySlots(
      req.user.id,
      new Date(startDate),
      new Date(endDate),
      slotDuration,
    );
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get counselor scheduling dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
  })
  async getDashboardData(@Req() req) {
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [upcomingMeetings, statistics, todaySlots] = await Promise.all([
      this.schedulingService.getUpcomingMeetings(req.user.id, 10),
      this.schedulingService.getMeetingStatistics(req.user.id, true),
      this.schedulingService.getCounselorTimeSlots(
        req.user.id,
        today.toISOString().split('T')[0],
      ),
    ]);

    return {
      upcomingMeetings,
      statistics,
      todaySlots,
      summary: {
        totalSlotsToday: todaySlots.length,
        availableSlotsToday: todaySlots.filter(
          (slot) => slot.isAvailable && !slot.isBooked,
        ).length,
        bookedSlotsToday: todaySlots.filter((slot) => slot.isBooked).length,
      },
    };
  }
}
