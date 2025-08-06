// apps/notification-service/src/templates/entities/notification-template.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_templates')
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_name', length: 100, unique: true })
  templateName: string;

  @Column({ name: 'template_category', length: 50 })
  templateCategory: string;

  @Column({ name: 'subject_template', type: 'text', nullable: true })
  subjectTemplate: string;

  @Column({ name: 'body_template', type: 'text' })
  bodyTemplate: string;

  @Column({ name: 'supported_channels', type: 'simple-array' })
  supportedChannels: string[];

  @Column({ name: 'variables', type: 'jsonb', nullable: true })
  variables: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
