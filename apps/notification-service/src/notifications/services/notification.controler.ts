// apps/notification-service/src/notifications/services/notification.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { NotificationService } from '../services/notification.service';
import { JwtAuthGuard } from 'apps/user-service/src/auth/guards/jwt-auth.guard';

import { SendNotificationDto } from '../dtos/send-notification.dto';
import { BulkNotificationDto } from '../dtos/bulk-notification.dto';
import { ScheduleNotificationDto } from '../dtos/schedule-notification.dto';
import { NotificationQueryDto } from '../dtos/notification-query.dto';
import { AppointmentReminderDto } from '../dtos/appointment-reminder.dto';
import { AppointmentStatusDto } from '../dtos/appointment-status.dto';
import { MarkReadDto } from '../dtos/mark-read.dto';
import { CreatePushSubscriptionDto } from '../dtos/push-subscription.dto';
import { GetUser } from 'apps/auth-service/src/auth/decorators/get-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @ApiOperation({ summary: 'Send a notification' })
  @ApiResponse({ status: 201, description: 'Notification sent successfully' })
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  async sendNotification(@Body() sendNotificationDto: SendNotificationDto) {
    return this.notificationService.sendNotification(sendNotificationDto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Send bulk notifications' })
  @ApiResponse({
    status: 201,
    description: 'Bulk notifications queued successfully',
  })
  @Throttle({ short: { limit: 2, ttl: 60000 } }) // 2 requests per minute for bulk operations
  async sendBulkNotifications(
    @Body() bulkNotificationDto: BulkNotificationDto,
  ) {
    return this.notificationService.sendBulkNotifications(bulkNotificationDto);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule a notification for future delivery' })
  @ApiResponse({
    status: 201,
    description: 'Notification scheduled successfully',
  })
  async scheduleNotification(
    @Body() scheduleNotificationDto: ScheduleNotificationDto,
  ) {
    return this.notificationService.sendNotification(scheduleNotificationDto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user notifications' })
  @ApiResponse({
    status: 200,
    description: 'User notifications retrieved successfully',
  })
  async getMyNotifications(
    @Request() req,
    @Query() query: NotificationQueryDto,
    @GetUser('userId') userId: string,
  ) {
    return this.notificationService.getUserNotifications(userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get notification statistics for current user' })
  @ApiResponse({
    status: 200,
    description: 'Notification statistics retrieved successfully',
  })
  async getMyNotificationStats(
    @Request() req,
    @GetUser('userId') userId: string,
  ) {
    return this.notificationService.getNotificationStats(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id') id: string,
    @Request() req,
    @GetUser('userId') userId: string,
  ) {
    await this.notificationService.markNotificationAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req, @GetUser('userId') userId: string) {
    const count =
      await this.notificationService.markAllNotificationsAsRead(userId);
    return { message: `${count} notifications marked as read` };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully',
  })
  @HttpCode(HttpStatus.OK)
  async deleteNotification(
    @Param('id') id: string,
    @Request() req,
    @GetUser('userId') userId: string,
  ) {
    await this.notificationService.deleteNotification(id, userId);
    return { message: 'Notification deleted successfully' };
  }

  // Appointment-specific endpoints for integration
  @Post('appointment/reminder')
  @ApiOperation({ summary: 'Send appointment reminder' })
  @ApiResponse({ status: 201, description: 'Appointment reminder sent' })
  async sendAppointmentReminder(
    @Body() appointmentReminderDto: AppointmentReminderDto,
  ) {
    await this.notificationService.sendAppointmentReminder({
      ...appointmentReminderDto,
      reminderType: appointmentReminderDto.reminderType || 'email',
    });
    return { message: 'Appointment reminder sent successfully' };
  }

  @Post('appointment/confirmed')
  @ApiOperation({ summary: 'Send appointment confirmation' })
  @ApiResponse({ status: 201, description: 'Appointment confirmation sent' })
  async sendAppointmentConfirmation(
    @Body() appointmentStatusDto: AppointmentStatusDto,
  ) {
    await this.notificationService.sendAppointmentConfirmation(
      appointmentStatusDto,
    );
    return { message: 'Appointment confirmation sent successfully' };
  }

  @Post('appointment/cancelled')
  @ApiOperation({ summary: 'Send appointment cancellation notification' })
  @ApiResponse({
    status: 201,
    description: 'Appointment cancellation notification sent',
  })
  async sendAppointmentCancellation(
    @Body() appointmentStatusDto: AppointmentStatusDto,
  ) {
    await this.notificationService.sendAppointmentCancellation(
      appointmentStatusDto,
    );
    return {
      message: 'Appointment cancellation notification sent successfully',
    };
  }

  // Push notification subscription management
  @Post('push/subscribe')
  @ApiOperation({ summary: 'Subscribe to push notifications' })
  @ApiResponse({ status: 201, description: 'Push subscription created' })
  async subscribeToPush(
    @Body() createPushSubscriptionDto: CreatePushSubscriptionDto,
    @Request() req,
  ) {
    // This would be implemented when push notifications are added
    return { message: 'Push notifications not yet supported' };
  }

  @Delete('push/unsubscribe/:subscriptionId')
  @ApiOperation({ summary: 'Unsubscribe from push notifications' })
  @ApiParam({ name: 'subscriptionId', description: 'Push subscription ID' })
  @ApiResponse({ status: 200, description: 'Push subscription removed' })
  @HttpCode(HttpStatus.OK)
  async unsubscribeFromPush(
    @Param('subscriptionId') subscriptionId: string,
    @Request() req,
  ) {
    // This would be implemented when push notifications are added
    return { message: 'Push notifications not yet supported' };
  }
}

// Admin-only controller for system-wide notification management
@ApiTags('notifications-admin')
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationAdminController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get system-wide notification statistics' })
  @ApiResponse({ status: 200, description: 'System notification statistics' })
  async getSystemStats() {
    return this.notificationService.getNotificationStats();
  }

  @Post('process-pending')
  @ApiOperation({
    summary: 'Manually trigger processing of pending notifications',
  })
  @ApiResponse({ status: 200, description: 'Pending notifications processed' })
  @HttpCode(HttpStatus.OK)
  async processPendingNotifications() {
    await this.notificationService.processPendingNotifications();
    return { message: 'Pending notifications processing triggered' };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get notifications for specific user (admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User notifications retrieved' })
  async getUserNotifications(
    @Param('userId') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getUserNotifications(userId, query);
  }

  @Get('user/:userId/stats')
  @ApiOperation({
    summary: 'Get notification statistics for specific user (admin only)',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User notification statistics' })
  async getUserStats(@Param('userId') userId: string) {
    return this.notificationService.getNotificationStats(userId);
  }
}
