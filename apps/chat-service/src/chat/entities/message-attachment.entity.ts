// apps/chat-service/src/chat/entities/message-attachment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ChatMessage } from './chat-message.entity';

@Entity('message_attachments')
export class MessageAttachment {
  @ApiProperty({ description: 'Unique attachment identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Message ID' })
  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @ApiProperty({ description: 'Original file name' })
  @Column({ name: 'file_name' })
  fileName: string;

  @ApiProperty({ description: 'File storage path' })
  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @ApiProperty({ description: 'File size in bytes' })
  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize: number | null;

  @ApiProperty({ description: 'MIME type of the file' })
  @Column({ name: 'file_type', type: 'text' })
  fileType: string;

  @ApiProperty({ description: 'Whether file is an image' })
  @Column({ name: 'is_image', default: false })
  isImage: boolean;

  @ApiProperty({ description: 'Whether file is a document' })
  @Column({ name: 'is_document', default: false })
  isDocument: boolean;

  @ApiProperty({ description: 'Attachment creation timestamp' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => ChatMessage, (message) => message.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;
}
