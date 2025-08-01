import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReminderType } from './meeting-reminder.entity';
import { MeetingType } from './scheduled-meeting.entity';
import { User } from 'apps/user-service/src/database/entities/user.entity';

// src/scheduling/entities/scheduling-preferences.entity.ts
@Entity('scheduling_preferences')
export class SchedulingPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({
    name: 'preferred_meeting_type',
    type: 'enum',
    enum: MeetingType,
    default: MeetingType.VIDEO_CALL,
  })
  preferredMeetingType: MeetingType;

  @Column({ name: 'preferred_duration_minutes', default: 60 })
  preferredDurationMinutes: number;

  @Column({ name: 'preferred_buffer_minutes', default: 5 })
  preferredBufferMinutes: number;

  @Column({ name: 'enable_reminders', default: true })
  enableReminders: boolean;

  @Column({
    name: 'reminder_times',
    type: 'int',
    array: true,
    default: [1440, 60, 15],
  })
  reminderTimes: number[];

  @Column({
    name: 'preferred_reminder_types',
    type: 'enum',
    enum: ReminderType,
    array: true,
    default: [ReminderType.EMAIL, ReminderType.PUSH],
  })
  preferredReminderTypes: ReminderType[];

  @Column({ default: 'UTC' })
  timezone: string;

  @Column({ name: 'earliest_time', type: 'time', default: '08:00' })
  earliestTime: string;

  @Column({ name: 'latest_time', type: 'time', default: '18:00' })
  latestTime: string;

  @Column({
    name: 'available_days',
    type: 'int',
    array: true,
    default: [1, 2, 3, 4, 5],
  })
  availableDays: number[];

  @Column({ name: 'require_counselor_confirmation', default: true })
  requireCounselorConfirmation: boolean;

  @Column({ name: 'allow_last_minute_booking', default: false })
  allowLastMinuteBooking: boolean;

  @Column({ name: 'minimum_advance_hours', default: 2 })
  minimumAdvanceHours: number;

  @Column({ name: 'maximum_advance_days', default: 30 })
  maximumAdvanceDays: number;

  @Column({ name: 'allow_cancellation', default: true })
  allowCancellation: boolean;

  @Column({ name: 'cancellation_deadline_hours', default: 24 })
  cancellationDeadlineHours: number;

  @Column({ name: 'allow_rescheduling', default: true })
  allowRescheduling: boolean;

  @Column({ name: 'max_reschedules', default: 2 })
  maxReschedules: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
