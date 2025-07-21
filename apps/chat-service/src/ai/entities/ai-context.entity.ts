// apps/chat-service/src/ai/entities/ai-context.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('ai_context')
@Index(['sessionId'])
@Index(['userId'])
@Index(['contextType'])
@Index(['relevanceScore'])
export class AiContext {
  @ApiProperty({ description: 'Unique context identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Associated session ID' })
  @Column({ name: 'session_id', type: 'uuid' })
  @Index()
  sessionId: string;

  @ApiProperty({ description: 'Associated user ID' })
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string | null;

  @ApiProperty({ description: 'Context data for AI processing' })
  @Column({ name: 'context_data', type: 'jsonb' })
  contextData: Record<string, any>;

  @ApiProperty({
    description: 'Type of context (conversation, summary, analysis)',
  })
  @Column({
    name: 'context_type',
    type: 'varchar',
    length: 50,
    default: 'conversation',
  })
  @Index()
  contextType: string;

  @ApiProperty({ description: 'Vector embedding for semantic search' })
  @Column({ type: 'vector', length: 1536, nullable: true })
  embedding: number[] | null;

  @ApiProperty({ description: 'Relevance score for this context' })
  @Column({
    name: 'relevance_score',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 1.0,
  })
  @Index()
  relevanceScore: number;

  @ApiProperty({ description: 'Context metadata' })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @ApiProperty({ description: 'Context expiration date' })
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @ApiProperty({ description: 'Context creation timestamp' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ description: 'Context last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
