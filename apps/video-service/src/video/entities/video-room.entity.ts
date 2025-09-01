// apps/video-service/src/video/entities/video-room.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VideoParticipant } from './video-participant.entity';
import { VideoSession } from './video-session.entity';

export type RoomStatus = 'waiting' | 'active' | 'ended' | 'cancelled';

@Entity('video_rooms')
export class VideoRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', unique: true })
  roomId: string;

  @Column({ name: 'meeting_id', nullable: true })
  meetingId: string;

  @Column({ name: 'host_user_id' })
  hostUserId: string;

  @Column({ name: 'access_code' })
  accessCode: string;

  @Column({ name: 'moderator_code' })
  moderatorCode: string;

  @Column({ name: 'max_participants', default: 2 })
  maxParticipants: number;

  @Column({ name: 'is_recording_enabled', default: false })
  isRecordingEnabled: boolean;

  @Column({ name: 'is_recording_active', default: false })
  isRecordingActive: boolean;

  @Column('json', { name: 'room_settings', nullable: true })
  roomSettings: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenShareEnabled: boolean;
    chatEnabled: boolean;
    waitingRoomEnabled: boolean;
    muteOnEntry: boolean;
    backgroundBlurEnabled?: boolean;
    maxVideosVisible?: number;
  };

  @Column('json', { name: 'rtc_configuration', nullable: true })
  rtcConfiguration: {
    iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
  };

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['waiting', 'active', 'ended', 'cancelled'],
    default: 'waiting',
  })
  status: RoomStatus;

  @Column({ name: 'started_at', nullable: true })
  startedAt: Date;

  @Column({ name: 'ended_at', nullable: true })
  endedAt: Date;

  @Column({ name: 'recording_url', nullable: true })
  recordingUrl: string;

  @Column('json', { nullable: true })
  metadata: {
    topic?: string;
    agenda?: string[];
    tags?: string[];
    customData?: Record<string, any>;
  };

  @OneToMany(() => VideoParticipant, (participant) => participant.room, {
    cascade: true,
  })
  participants: VideoParticipant[];

  @OneToMany(() => VideoSession, (session) => session.room, { cascade: true })
  sessions: VideoSession[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Virtual properties
  get isActive(): boolean {
    return this.status === 'active';
  }

  get activeParticipantCount(): number {
    return (
      this.participants?.filter((p) => p.status === 'connected').length || 0
    );
  }

  get duration(): number {
    if (!this.startedAt) return 0;
    const endTime = this.endedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }
}
