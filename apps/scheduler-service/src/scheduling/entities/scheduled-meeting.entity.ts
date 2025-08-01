// src/scheduling/entities/scheduled-meeting.entity.ts
import { User } from 'apps/user-service/src/database/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MeetingReminder } from './meeting-reminder.entity';
import { MeetingParticipant } from './meeting-participant.entity';

export enum MeetingType {
  AUDIO_ONLY = 'audio_only',
  VIDEO_CALL = 'video_call',
  PHONE_CALL = 'phone_call',
  IN_PERSON = 'in_person',
}

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  RESCHEDULED = 'rescheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum RecurringPattern {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

@Entity('scheduled_meetings')
@Index(['userId'])
@Index(['counselorId'])
@Index(['scheduledStart'])
@Index(['status'])
export class ScheduledMeeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'counselor_id' })
  counselorId: string;

  @Column({ default: 'Counseling Session' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: MeetingType,
    name: 'meeting_type',
    default: MeetingType.VIDEO_CALL,
  })
  meetingType: MeetingType;

  @Column({ name: 'scheduled_start', type: 'timestamptz' })
  scheduledStart: Date;

  @Column({ name: 'scheduled_end', type: 'timestamptz' })
  scheduledEnd: Date;

  @Column({ name: 'actual_start', type: 'timestamptz', nullable: true })
  actualStart: Date;

  @Column({ name: 'actual_end', type: 'timestamptz', nullable: true })
  actualEnd: Date;

  @Column({ name: 'duration_minutes', default: 60 })
  durationMinutes: number;

  @Column({ name: 'buffer_before_minutes', default: 5 })
  bufferBeforeMinutes: number;

  @Column({ name: 'buffer_after_minutes', default: 5 })
  bufferAfterMinutes: number;

  @Column({
    type: 'enum',
    enum: MeetingStatus,
    default: MeetingStatus.SCHEDULED,
  })
  status: MeetingStatus;

  @Column({ name: 'confirmation_required', default: true })
  confirmationRequired: boolean;

  @Column({ name: 'confirmed_by_user', default: false })
  confirmedByUser: boolean;

  @Column({ name: 'confirmed_by_counselor', default: false })
  confirmedByCounselor: boolean;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date;

  @Column({ name: 'is_recurring', default: false })
  isRecurring: boolean;

  @Column({
    name: 'recurring_pattern',
    type: 'enum',
    enum: RecurringPattern,
    default: RecurringPattern.NONE,
  })
  recurringPattern: RecurringPattern;

  @Column({ name: 'recurring_interval', default: 1 })
  recurringInterval: number;

  @Column({ name: 'recurring_until', type: 'date', nullable: true })
  recurringUntil: Date;

  @Column({ name: 'parent_meeting_id', nullable: true })
  parentMeetingId: string;

  @Column({ name: 'meeting_room_id', nullable: true })
  meetingRoomId: string;

  @Column({ name: 'meeting_room_url', type: 'text', nullable: true })
  meetingRoomUrl: string;

  @Column({ name: 'meeting_room_password', nullable: true })
  meetingRoomPassword: string;

  @Column({ name: 'phone_number', nullable: true })
  phoneNumber: string;

  @Column({ name: 'dial_in_code', nullable: true })
  dialInCode: string;

  @Column({ name: 'location_name', nullable: true })
  locationName: string;

  @Column({ name: 'location_address', type: 'text', nullable: true })
  locationAddress: string;

  @Column({ name: 'location_room', nullable: true })
  locationRoom: string;

  @Column({ name: 'preparation_notes', type: 'text', nullable: true })
  preparationNotes: string;

  @Column({ name: 'session_notes', type: 'text', nullable: true })
  sessionNotes: string;

  @Column({ name: 'session_summary', type: 'text', nullable: true })
  sessionSummary: string;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string;

  @Column({ name: 'cancelled_by', nullable: true })
  cancelledBy: string;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date;

  @Column({ name: 'rescheduled_from', nullable: true })
  rescheduledFrom: string;

  @Column({ name: 'rescheduled_to', nullable: true })
  rescheduledTo: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'counselor_id' })
  counselor: User;

  @ManyToOne(() => ScheduledMeeting, { nullable: true })
  @JoinColumn({ name: 'parent_meeting_id' })
  parentMeeting: ScheduledMeeting;

  @OneToMany(() => ScheduledMeeting, (meeting) => meeting.parentMeeting)
  recurringMeetings: ScheduledMeeting[];

  @OneToMany(() => MeetingReminder, (reminder) => reminder.meeting)
  reminders: MeetingReminder[];

  @OneToMany(() => MeetingParticipant, (participant) => participant.meeting)
  participants: MeetingParticipant[];
}
