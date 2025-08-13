// apps/mood-service/src/database/entities/mood-trigger.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mood_triggers')
export class MoodTrigger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'trigger_name' })
  triggerName: string;

  @Column({ name: 'trigger_category', nullable: true })
  triggerCategory?: string;

  @Column({ name: 'impact_score', nullable: true })
  impactScore?: number;

  @Column({ name: 'frequency_count', default: 0 })
  frequencyCount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
