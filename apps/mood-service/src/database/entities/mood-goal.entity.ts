// apps/mood-service/src/database/entities/mood-goal.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mood_goals')
export class MoodGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'goal_type' })
  goalType: string;

  @Column('decimal', {
    name: 'target_value',
    precision: 5,
    scale: 2,
  })
  targetValue: number;

  @Column('decimal', {
    name: 'current_value',
    precision: 5,
    scale: 2,
    default: 0,
  })
  currentValue: number;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate?: Date;

  @Column({ name: 'is_achieved', default: false })
  isAchieved: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column('text', { nullable: true })
  description?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
