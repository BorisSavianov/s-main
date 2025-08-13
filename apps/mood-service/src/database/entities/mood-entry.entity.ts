// apps/mood-service/src/database/entities/mood-entry.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MoodRating {
  VERY_POOR = 'very_poor',
  POOR = 'poor',
  NEUTRAL = 'neutral',
  GOOD = 'good',
  VERY_GOOD = 'very_good',
}

@Entity('mood_entries')
export class MoodEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  rating: number;

  @Column({
    type: 'enum',
    enum: MoodRating,
    name: 'mood_rating',
  })
  moodRating: MoodRating;

  @Column('text', { nullable: true })
  notes?: string;

  @Column({ name: 'energy_level', nullable: true })
  energyLevel?: number;

  @Column({ name: 'stress_level', nullable: true })
  stressLevel?: number;

  @Column('decimal', {
    name: 'sleep_hours',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  sleepHours?: number;

  @Column({ name: 'exercise_minutes', nullable: true })
  exerciseMinutes?: number;

  @Column({ name: 'medication_taken', nullable: true })
  medicationTaken?: boolean;

  @Column('text', { array: true, nullable: true })
  triggers?: string[];

  @Column('text', { array: true, nullable: true })
  activities?: string[];

  @Column({ name: 'entry_date', type: 'date' })
  entryDate: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
