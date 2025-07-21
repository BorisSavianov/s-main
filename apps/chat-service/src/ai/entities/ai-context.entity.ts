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
  @Column({ name: