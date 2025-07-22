// apps/chat-service/src/chat/entities/chat-session.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ChatMessage } from './chat-message.entity';
import { ChatSessionSummary } from './chat-session-summary.entity';

@Entity('chat_sessions')
@Index(['userId'])
@Index(['counselorId'])
@Index(['sessionToken'])
@Index(['isActive'])
export class ChatSession {
  @ApiProperty({ description: 'Unique session identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User ID (null for anonymous sessions)' })
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string | null;

  @ApiProperty({ description: 'Counselor ID (for human-assisted sessions)' })
  @Column({ name: 'counselor_id', type: 'uuid', nullable: true })
  @Index()
  counselorId: string | null;

  @ApiProperty({ description: 'Unique session token for anonymous sessions' })
  @Column({ name: 'session_token', unique: true })
  @Index()
  sessionToken: string;

  @ApiProperty({ description: 'Whether this is an anonymous session' })
  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @ApiProperty({ description: 'Whether the session is currently active' })
  @Column({ name: 'is_active', default: true })
  @Index()
  isActive: boolean;

  @ApiProperty({ description: 'Session start timestamp' })
  @Column({
    name: 'started_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt: Date;

  @ApiProperty({ description: 'Session end timestamp' })
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ description: 'AI-generated session summary' })
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @ApiProperty({ description: 'Overall sentiment score (-1 to 1)' })
  @Column({
    name: 'overall_sentiment',
    type: 'decimal',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  overallSentiment: number | null;

  @ApiProperty({ description: 'Session creation timestamp' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ description: 'Session last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiProperty({
    description:
      'Metadata about the session, such as setup completion and user type',
  })
  @Column('json', { nullable: true })
  sessionMetadata: {
    setupComplete?: boolean;
    setupAt?: string;
    userType?: 'anonymous' | 'registered';
    initialSetupData?: {
      userAgent: string;
      ipHash: string;
      referrer: string;
    };
  };

  // Relations
  @OneToMany(() => ChatMessage, (message) => message.session, {
    cascade: true,
    eager: false,
  })
  messages: ChatMessage[];

  @OneToMany(() => ChatSessionSummary, (summary) => summary.session, {
    cascade: true,
    eager: false,
  })
  summaries: ChatSessionSummary[];
}
