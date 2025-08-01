import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ScheduledMeeting } from './scheduled-meeting.entity';
import { User } from 'apps/user-service/src/database/entities/user.entity';

// src/scheduling/entities/meeting-reminder.entity.ts
export enum ReminderType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

@Entity('meeting_reminders')
export class MeetingReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meeting_id' })
  meetingId: string;

  @Column({ name: 'recipient_id' })
  recipientId: string;

  @Column({
    name: 'reminder_type',
    type: 'enum',
    enum: ReminderType,
  })
  reminderType: ReminderType;

  @Column({ name: 'scheduled_time', type: 'timestamptz' })
  scheduledTime: Date;

  @Column({ name: 'minutes_before' })
  minutesBefore: number;

  @Column({ name: 'is_sent', default: false })
  isSent: boolean;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date;

  @Column({ name: 'is_acknowledged', default: false })
  isAcknowledged: boolean;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ScheduledMeeting)
  @JoinColumn({ name: 'meeting_id' })
  meeting: ScheduledMeeting;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;
}
