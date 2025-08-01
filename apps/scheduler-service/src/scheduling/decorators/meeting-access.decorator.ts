// src/scheduling/decorators/meeting-access.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const MEETING_ACCESS_KEY = 'meetingAccess';

export enum MeetingAccessType {
  OWNER = 'owner',
  PARTICIPANT = 'participant',
  COUNSELOR = 'counselor',
}

export const MeetingAccess = (accessType: MeetingAccessType) =>
  SetMetadata(MEETING_ACCESS_KEY, accessType);
