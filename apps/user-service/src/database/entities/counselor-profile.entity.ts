// apps/user-service/src/database/entities/counselor-profile.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity('counselor_profiles')
export class CounselorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'license_number', nullable: true })
  licenseNumber?: string;

  @Column('text', { array: true, nullable: true })
  specialties?: string[];

  @Column('text', { array: true, nullable: true })
  qualifications?: string[];

  @Column({ name: 'experience_years', nullable: true })
  experienceYears?: number;

  @Column('decimal', {
    name: 'hourly_rate',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  hourlyRate?: number;

  @Column('text', { nullable: true })
  bio?: string;

  @Column('text', { array: true, nullable: true })
  languages?: string[];

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;

  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ name: 'total_reviews', default: 0 })
  totalReviews: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => User, (user) => user.counselorProfile)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
