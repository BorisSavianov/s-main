// src/scheduling/listeners/meeting-event.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  MeetingCreatedEvent,
  MeetingCancelledEvent,
  MeetingConfirmedEvent,
  MeetingRescheduledEvent,
} from '../events/meeting.events';
import { CalendarService } from '../services/calendar.service';
import { MeetingRoomService } from '../services/meeting-room.service';

@Injectable()
export class MeetingEventListener {
  private readonly logger = new Logger(MeetingEventListener.name);

  constructor(
    private readonly calendarService: CalendarService,
    private readonly meetingRoomService: MeetingRoomService,
  ) {}

  @OnEvent('meeting.created')
  async handleMeetingCreated(event: MeetingCreatedEvent) {
    this.logger.log(`Meeting created: ${event.meetingId}`);

    // Create calendar events for both participants
    // await this.calendarService.createCalendarEvent(meeting);

    // Send confirmation emails
    // await this.emailService.sendMeetingConfirmation(event);
  }

  @OnEvent('meeting.cancelled')
  async handleMeetingCancelled(event: MeetingCancelledEvent) {
    this.logger.log(`Meeting cancelled: ${event.meetingId}`);

    // Cancel calendar events
    // Delete meeting room if applicable
    // Send cancellation notifications
  }

  @OnEvent('meeting.confirmed')
  async handleMeetingConfirmed(event: MeetingConfirmedEvent) {
    this.logger.log(`Meeting confirmed: ${event.meetingId}`);

    if (event.isFullyConfirmed) {
      // Send final confirmation with meeting details
      // Create calendar invites
    }
  }

  @OnEvent('meeting.rescheduled')
  async handleMeetingRescheduled(event: MeetingRescheduledEvent) {
    this.logger.log(`Meeting rescheduled: ${event.meetingId}`);

    // Update calendar events
    // Send rescheduling notifications
  }
}
