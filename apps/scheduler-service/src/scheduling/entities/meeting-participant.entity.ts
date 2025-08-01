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

// src/scheduling/entities/meeting-participant.entity.ts
@Entity('meeting_participants')
export class MeetingParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meeting_id' })
  meetingId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ default: 'participant' })
  role: string;

  @Column({ name: 'invited_by', nullable: true })
  invitedBy: string;

  @Column({ name: 'invitation_sent_at', type: 'timestamptz', nullable: true })
  invitationSentAt: Date;

  @Column({ default: 'pending' })
  response: string;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date;

  @Column({ name: 'attendance_status', default: 'invited' })
  attendanceStatus: string;

  @Column({ name: 'can_share_video', default: true })
  canShareVideo: boolean;

  @Column({ name: 'can_share_audio', default: true })
  canShareAudio: boolean;

  @Column({ name: 'can_share_screen', default: false })
  canShareScreen: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ScheduledMeeting)
  @JoinColumn({ name: 'meeting_id' })
  meeting: ScheduledMeeting;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
