// apps/user-service/src/database/entities/oauth-provider.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity('oauth_providers')
export class OAuthProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  provider: string;

  @Column({ name: 'provider_id' })
  providerId: string;

  @Column({ name: 'provider_email', nullable: true })
  providerEmail?: string;

  @Column('text', { name: 'access_token', nullable: true })
  accessToken?: string;

  @Column('text', { name: 'refresh_token', nullable: true })
  refreshToken?: string;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.oauthProviders)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
