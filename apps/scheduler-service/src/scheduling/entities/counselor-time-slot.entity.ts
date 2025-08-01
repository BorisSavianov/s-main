import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RecurringPattern, ScheduledMeeting } from './scheduled-meeting.entity';
import { User } from 'apps/user-service/src/database/entities/user.entity';

// src/scheduling/entities/counselor-time-slot.entity.ts
@Entity('counselor_time_slots')
@Index(['counselorId'])
@Index(['slotDate'])
export class CounselorTimeSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'counselor_id' })
  counselorId: string;

  @Column({ name: 'slot_date', type: 'date' })
  slotDate: Date;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;

  @Column({ name: 'is_booked', default: false })
  isBooked: boolean;

  @Column({ name: 'meeting_id', nullable: true })
  meetingId: string;

  @Column({ name: 'slot_duration_minutes', default: 60 })
  slotDurationMinutes: number;

  @Column({ name: 'buffer_minutes', default: 15 })
  bufferMinutes: number;

  @Column({ name: 'max_bookings', default: 1 })
  maxBookings: number;

  @Column({ name: 'current_bookings', default: 0 })
  currentBookings: number;

  @Column({
    name: 'custom_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  customRate: number;

  @Column({ name: 'is_recurring', default: false })
  isRecurring: boolean;

  @Column({
    name: 'recurring_pattern',
    type: 'enum',
    enum: RecurringPattern,
    default: RecurringPattern.NONE,
  })
  recurringPattern: RecurringPattern;

  @Column({ name: 'recurring_until', type: 'date', nullable: true })
  recurringUntil: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'counselor_id' })
  counselor: User;

  @ManyToOne(() => ScheduledMeeting, { nullable: true })
  @JoinColumn({ name: 'meeting_id' })
  meeting: ScheduledMeeting;
}
