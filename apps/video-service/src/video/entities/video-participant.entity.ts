// apps/video-service/src/video/entities/video-participant.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VideoRoom } from './video-room.entity';

export type ParticipantRole = 'host' | 'moderator' | 'participant' | 'observer';
export type ParticipantStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

@Entity('video_participants')
export class VideoParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @Column()
  userId: string;

  @Column()
  displayName: string;

  @Column({
    type: 'enum',
    enum: ['host', 'moderator', 'participant', 'observer'],
    default: 'participant',
  })
  role: ParticipantRole;

  @Column({
    type: 'enum',
    enum: ['connecting', 'connected', 'reconnecting', 'disconnected'],
    default: 'connecting',
  })
  status: ParticipantStatus;

  @Column('json', { nullable: true })
  deviceCapabilities: {
    video: boolean;
    audio: boolean;
    screenShare: boolean;
    recording?: boolean;
  };

  @Column('json', { nullable: true })
  mediaState: {
    video: boolean;
    audio: boolean;
    screenShare: boolean;
    speaking?: boolean;
    dominantSpeaker?: boolean;
  };

  @Column('json', { nullable: true })
  connectionStats: {
    joinTime?: Date;
    connectionQuality?: 'excellent' | 'good' | 'poor';
    bandwidth?: number;
    packetLoss?: number;
    latency?: number;
  };

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  lastSeen: Date;

  @Column({ nullable: true })
  leftAt: Date;

  @Column('json', { nullable: true })
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    customData?: Record<string, any>;
  };

  @ManyToOne(() => VideoRoom, (room) => room.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'roomId' })
  room: VideoRoom;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual properties
  get isConnected(): boolean {
    return this.status === 'connected';
  }

  get sessionDuration(): number {
    const endTime = this.leftAt || new Date();
    return endTime.getTime() - this.joinedAt.getTime();
  }
}
