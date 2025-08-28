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

  @Column({ unique: true })
  roomId: string;

  @Column({ nullable: true })
  meetingId: string;

  @Column()
  hostUserId: string;

  @Column()
  accessCode: string;

  @Column()
  moderatorCode: string;

  @Column({ default: 2 })
  maxParticipants: number;

  @Column({ default: false })
  isRecordingEnabled: boolean;

  @Column({ default: false })
  isRecordingActive: boolean;

  @Column('json', { nullable: true })
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

  @Column('json', { nullable: true })
  rtcConfiguration: {
    iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
  };

  @Column({
    type: 'enum',
    enum: ['waiting', 'active', 'ended', 'cancelled'],
    default: 'waiting',
  })
  status: RoomStatus;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  endedAt: Date;

  @Column({ nullable: true })
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
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
