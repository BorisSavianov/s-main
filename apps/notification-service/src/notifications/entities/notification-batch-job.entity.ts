// apps/notification-service/src/notifications/entities/notification-batch-job.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('notification_batch_jobs')
export class NotificationBatchJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_name', length: 100 })
  jobName: string;

  @Column({ name: 'job_type', length: 50 })
  jobType: string; // 'scheduled', 'bulk', 'campaign'

  @Column({ name: 'target_users', type: 'uuid', array: true, nullable: true })
  targetUsers: string[];

  @Column({ name: 'template_id', nullable: true })
  templateId: string;

  @Column({ length: 20, default: 'pending' })
  status: string; // 'pending', 'running', 'completed', 'failed'

  @Column({ name: 'total_count', default: 0 })
  totalCount: number;

  @Column({ name: 'sent_count', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', default: 0 })
  failedCount: number;

  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
