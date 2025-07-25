// apps/chat-service/src/chat/entities/chat-message.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ChatSession } from './chat-session.entity';
import { MessageAttachment } from './message-attachment.entity';

export enum SenderType {
  USER = 'user',
  AI = 'ai',
  COUNSELOR = 'counselor',
  SYSTEM = 'system',
}

@Entity('chat_messages')
export class ChatMessage {
  @ApiProperty({ description: 'Unique message identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Chat session ID' })
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ApiProperty({ description: 'Sender user ID (null for AI messages)' })
  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId: string | null;

  @ApiProperty({ description: 'Type of message sender', enum: SenderType })
  @Column({ name: 'sender_type', type: 'varchar', length: 20 })
  senderType: SenderType;

  @ApiProperty({ description: 'Message content' })
  @Column({ type: 'text' })
  content: string;

  @ApiProperty({ description: 'Content type (text, image, document)' })
  @Column({ name: 'content_type', default: 'text', length: 20 })
  contentType: string;

  @ApiProperty({ description: 'Sentiment score (-1 to 1)' })
  @Column({
    name: 'sentiment_score',
    type: 'decimal',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  sentimentScore: number | null;

  @ApiProperty({ description: 'Whether message is flagged for review' })
  @Column({ name: 'is_flagged', default: false })
  isFlagged: boolean;

  @ApiProperty({ description: 'Reason for flagging' })
  @Column({ name: 'flag_reason', type: 'text', nullable: true })
  flagReason: string | null;

  @ApiProperty({ description: 'Vector embedding for semantic search' })
  @Column({ type: 'varchar', length: 768, nullable: true })
  embedding: number[] | null;

  @ApiProperty({ description: 'Message creation timestamp' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ description: 'Message last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;

  @OneToMany(() => MessageAttachment, (attachment) => attachment.message, {
    cascade: true,
    eager: false,
  })
  attachments: MessageAttachment[];
}
