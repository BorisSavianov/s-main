// apps/mood-service/src/database/entities/mood-insight.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mood_insights')
export class MoodInsight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'insight_type' })
  insightType: string;

  @Column('text', { name: 'insight_text' })
  insightText: string;

  @Column({ nullable: true })
  recommendation?: string;

  @Column({
    type: 'enum',
    enum: ['PATTERN', 'CORRELATION', 'ACHIEVEMENT'],
    default: 'PATTERN',
  })
  category: string;

  @Column({ name: 'related_entity_id', nullable: true })
  relatedEntityId?: string;

  @Column('decimal', {
    name: 'confidence_score',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  confidenceScore?: number;

  @Column({ name: 'data_points', nullable: true })
  dataPoints?: number;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'is_helpful', nullable: true })
  isHelpful?: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
