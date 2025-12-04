// apps/chat-service/src/chat/entities/counselor-queue.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum QueueStatus {
  WAITING = 'waiting',
  MATCHED = 'matched',
  LEFT = 'left',
}

@Entity('counselor_queue')
@Index(['counselorId'])
@Index(['status'])
export class CounselorQueue {
  @ApiProperty({ description: 'Unique queue entry identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Counselor user ID' })
  @Column({ name: 'counselor_id', type: 'uuid' })
  counselorId: string;

  @ApiProperty({ description: 'Queue status', enum: QueueStatus })
  @Column({ 
    type: 'varchar', 
    length: 20, 
    default: QueueStatus.WAITING 
  })
  status: QueueStatus;

  @ApiProperty({ description: 'When counselor joined the queue' })
  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @ApiProperty({ description: 'When counselor was matched with a user' })
  @Column({ name: 'matched_at', type: 'timestamptz', nullable: true })
  matchedAt: Date | null;

  @ApiProperty({ description: 'Session ID if matched' })
  @Column({ name: 'matched_session_id', type: 'uuid', nullable: true })
  matchedSessionId: string | null;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
