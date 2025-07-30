// apps/user-service/src/database/entities/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';

import { CounselorProfile } from './counselor-profile.entity';
import { UserSession } from './user-session.entity';
import { OAuthProvider } from './oauth-provider.entity';

export enum UserRole {
  USER = 'user',
  COUNSELOR = 'counselor',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash?: string;

  @Column({ name: 'first_name', nullable: true })
  firstName?: string;

  @Column({ name: 'last_name', nullable: true })
  lastName?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ nullable: true })
  gender?: string;

  @Column({ default: 'UTC' })
  timezone: string;

  @Column({ name: 'profile_picture_url', nullable: true })
  profilePictureUrl?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'last_login', nullable: true })
  lastLogin?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  // Relations
  @OneToOne(() => CounselorProfile, (profile) => profile.user)
  counselorProfile?: CounselorProfile;

  @OneToMany(() => UserSession, (session) => session.user)
  sessions: UserSession[];

  @OneToMany(() => OAuthProvider, (provider) => provider.user)
  oauthProviders: OAuthProvider[];
}
