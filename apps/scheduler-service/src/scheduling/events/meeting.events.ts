// src/scheduling/events/meeting.events.ts
export class MeetingCreatedEvent {
  constructor(
    public readonly meetingId: string,
    public readonly userId: string,
    public readonly counselorId: string,
    public readonly scheduledStart: Date,
  ) {}
}

export class MeetingCancelledEvent {
  constructor(
    public readonly meetingId: string,
    public readonly cancelledBy: string,
    public readonly reason?: string,
  ) {}
}

export class MeetingConfirmedEvent {
  constructor(
    public readonly meetingId: string,
    public readonly confirmedBy: string,
    public readonly isFullyConfirmed: boolean,
  ) {}
}

export class MeetingRescheduledEvent {
  constructor(
    public readonly meetingId: string,
    public readonly oldStart: Date,
    public readonly newStart: Date,
    public readonly rescheduledBy: string,
  ) {}
}
