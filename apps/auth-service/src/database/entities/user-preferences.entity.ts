// apps/user-service/src/database/entities/user-preferences.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity('user_preferences')
export class UserPreferences {
  @ApiProperty({ description: 'Unique preference identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User ID' })
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @ApiProperty({ description: 'Enable web search in AI chats' })
  @Column({ name: 'web_search_enabled', type: 'boolean', default: false })
  webSearchEnabled: boolean;

  @ApiProperty({ description: 'Enable email notifications' })
  @Column({ name: 'email_notifications', type: 'boolean', default: true })
  emailNotifications: boolean;

  @ApiProperty({ description: 'Enable push notifications' })
  @Column({ name: 'push_notifications', type: 'boolean', default: true })
  pushNotifications: boolean;

  @ApiProperty({ description: 'Theme preference' })
  @Column({ name: 'theme', type: 'varchar', length: 20, default: 'light' })
  theme: string;

  @ApiProperty({ description: 'Language preference' })
  @Column({ name: 'language', type: 'varchar', length: 10, default: 'en' })
  language: string;

  @ApiProperty({ description: 'Timezone' })
  @Column({ name: 'timezone', type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @ApiProperty({ description: 'Additional preferences as JSON' })
  @Column({ type: 'jsonb', nullable: true })
  preferences: Record<string, any>;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => User, (user) => user.preferences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
