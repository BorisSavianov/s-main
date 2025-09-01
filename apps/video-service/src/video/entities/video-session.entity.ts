// apps/video-service/src/video/entities/video-session.entity.ts
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

export type SessionType =
  | 'video_call'
  | 'screen_share'
  | 'recording'
  | 'live_stream';

@Entity('video_sessions')
export class VideoSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id' })
  roomId: string;

  @Column({ name: 'initiator_user_id' })
  initiatorUserId: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: ['video_call', 'screen_share', 'recording', 'live_stream'],
    default: 'video_call',
  })
  type: SessionType;

  @Column({ name: 'ended_at', nullable: true })
  endedAt: Date;

  @Column('json', { name: 'session_data', nullable: true })
  sessionData: {
    quality?: 'low' | 'medium' | 'high' | 'hd';
    bandwidth?: number;
    participants?: string[];
    events?: Array<{
      type: string;
      timestamp: Date;
      data?: any;
    }>;
    summary?: {
      totalDuration: number;
      participantCount: number;
      maxConcurrentParticipants: number;
    };
  };

  @Column('json', { name: 'recording_metadata', nullable: true })
  recordingMetadata: {
    fileName?: string;
    filePath?: string;
    fileSize?: number;
    duration?: number;
    format?: string;
    quality?: string;
  };

  @ManyToOne(() => VideoRoom, (room) => room.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id', referencedColumnName: 'roomId' })
  room: VideoRoom;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Virtual properties
  get duration(): number {
    const endTime = this.endedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  get isActive(): boolean {
    return !this.endedAt;
  }
}
