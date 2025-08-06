// apps/notification-service/src/preferences/entities/notification-preference.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from 'apps/auth-service/src/database/entities/user.entity';

@Entity('notification_preferences')
@Unique(['userId', 'notificationCategory'])
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'notification_category', length: 50 })
  notificationCategory: string; // 'appointments', 'mood_reminders', 'system', 'marketing'

  @Column({ name: 'email_enabled', default: true })
  emailEnabled: boolean;

  @Column({ name: 'sms_enabled', default: false })
  smsEnabled: boolean;

  @Column({ name: 'push_enabled', default: true })
  pushEnabled: boolean;

  @Column({ name: 'in_app_enabled', default: true })
  inAppEnabled: boolean;

  @Column({ length: 20, default: 'immediate' })
  frequency: string; // 'immediate', 'daily', 'weekly', 'disabled'

  @Column({ name: 'quiet_hours_start', type: 'time', nullable: true })
  quietHoursStart: string;

  @Column({ name: 'quiet_hours_end', type: 'time', nullable: true })
  quietHoursEnd: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
