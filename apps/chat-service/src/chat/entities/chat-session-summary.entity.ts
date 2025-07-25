// apps/chat-service/src/chat/entities/chat-session-summary.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ChatSession } from './chat-session.entity';

@Entity('chat_session_summaries')
export class ChatSessionSummary {
  @ApiProperty({ description: 'Unique summary identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Chat session ID' })
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ApiProperty({ description: 'Summary text content' })
  @Column({ name: 'summary_text', type: 'text' })
  summaryText: string;

  @ApiProperty({ description: 'Key topics discussed', type: [String] })
  @Column({ name: 'key_topics', type: 'text', array: true, default: '{}' })
  keyTopics: string[];

  @ApiProperty({ description: 'Detailed sentiment analysis' })
  @Column({ name: 'sentiment_analysis', type: 'jsonb', nullable: true })
  sentimentAnalysis: Record<string, any> | null;

  @ApiProperty({ description: 'AI recommendations', type: [String] })
  @Column({ type: 'text', array: true, default: '{}' })
  recommendations: string[];

  @ApiProperty({ description: 'Who created the summary (ai/human)' })
  @Column({ name: 'created_by', default: 'ai', length: 20 })
  createdBy: string;

  @ApiProperty({ description: 'Summary creation timestamp' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ description: 'Summary last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ChatSession, (session) => session.summaries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;
}
