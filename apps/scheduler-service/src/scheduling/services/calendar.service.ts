// src/scheduling/services/calendar.service.ts
import { Injectable } from '@nestjs/common';
import { ScheduledMeeting } from '../entities/scheduled-meeting.entity';

export interface CalendarEvent {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees: string[];
  meetingUrl?: string;
}

@Injectable()
export class CalendarService {
  async createCalendarEvent(meeting: ScheduledMeeting): Promise<string> {
    const event: CalendarEvent = {
      title: meeting.title,
      description: meeting.description || 'Counseling Session',
      startTime: meeting.scheduledStart,
      endTime: meeting.scheduledEnd,
      location: meeting.locationName || meeting.meetingRoomUrl,
      attendees: [meeting.user?.email, meeting.counselor?.email].filter(
        Boolean,
      ),
      meetingUrl: meeting.meetingRoomUrl,
    };

    // Integrate with calendar providers (Google Calendar, Outlook, etc.)
    // const eventId = await this.createEventInProvider(event);
    const eventId = `cal_${meeting.id}`;

    return eventId;
  }

  async updateCalendarEvent(
    eventId: string,
    meeting: ScheduledMeeting,
  ): Promise<void> {
    // Update event in calendar provider
    // await this.updateEventInProvider(eventId, meeting);
  }

  async deleteCalendarEvent(eventId: string): Promise<void> {
    // Delete event from calendar provider
    // await this.deleteEventInProvider(eventId);
  }

  generateICalContent(meeting: ScheduledMeeting): string {
    const start =
      meeting.scheduledStart.toISOString().replace(/[-:]/g, '').split('.')[0] +
      'Z';
    const end =
      meeting.scheduledEnd.toISOString().replace(/[-:]/g, '').split('.')[0] +
      'Z';
    const created =
      meeting.createdAt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Your App//Your App//EN
BEGIN:VEVENT
UID:${meeting.id}@yourapp.com
DTSTAMP:${created}
DTSTART:${start}
DTEND:${end}
SUMMARY:${meeting.title}
DESCRIPTION:${meeting.description || 'Counseling Session'}
LOCATION:${meeting.locationName || meeting.meetingRoomUrl || ''}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
  }
}
