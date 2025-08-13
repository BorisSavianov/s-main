// apps/mood-service/src/database/entities/mood-pattern.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TrendDirection {
  IMPROVING = 'improving',
  DECLINING = 'declining',
  STABLE = 'stable',
}

@Entity('mood_patterns')
export class MoodPattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'pattern_type' })
  patternType: string;

  @Column('jsonb', { name: 'pattern_data' })
  patternData: any;

  @Column('decimal', {
    name: 'average_rating',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  averageRating?: number;

  @Column({
    type: 'enum',
    enum: TrendDirection,
    name: 'trend_direction',
    nullable: true,
  })
  trendDirection?: TrendDirection;

  @Column('decimal', {
    name: 'confidence_score',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  confidenceScore?: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
