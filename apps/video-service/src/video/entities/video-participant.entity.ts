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

  @Column({ name: 'room_id' })
  roomId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'display_name' })
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

  @Column('json', { name: 'device_capabilities', nullable: true })
  deviceCapabilities: {
    video: boolean;
    audio: boolean;
    screenShare: boolean;
    recording?: boolean;
  };

  @Column('json', { name: 'media_state', nullable: true })
  mediaState: {
    video: boolean;
    audio: boolean;
    screenShare: boolean;
    speaking?: boolean;
    dominantSpeaker?: boolean;
  };

  @Column('json', { name: 'connection_stats', nullable: true })
  connectionStats: {
    joinTime?: Date;
    connectionQuality?: 'excellent' | 'good' | 'poor';
    bandwidth?: number;
    packetLoss?: number;
    latency?: number;
  };

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ name: 'last_seen', nullable: true })
  lastSeen: Date;

  @Column({ name: 'left_at', nullable: true })
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
  @JoinColumn({ name: 'room_id', referencedColumnName: 'roomId' })
  room: VideoRoom;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
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
