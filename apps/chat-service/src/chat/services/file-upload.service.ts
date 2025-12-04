// apps/chat-service/src/chat/services/file-upload.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as sharp from 'sharp';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { Multer } from 'multer';

// Constants for file handling
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_DIMENSION = 1920;
const THUMBNAIL_SIZE = 200;
const COMPRESSION_QUALITY = 80;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface UploadedFile {
  id: string;
  url: string;
  thumbnailUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileUploadOptions {
  messageId?: string;
  generateThumbnail?: boolean;
  compressImage?: boolean;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(MessageAttachment)
    private readonly attachmentRepository: Repository<MessageAttachment>,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    // Use PUBLIC_URL (externally accessible) or fall back to internal service URL
    // PUBLIC_URL should be the chat service URL as accessible by the frontend
    this.baseUrl = this.configService.get<string>('PUBLIC_URL', 
      this.configService.get<string>('BASE_URL', 'http://localhost:4002')
    );
    this.ensureUploadDirectory();
  }

  /**
   * Ensure upload directories exist
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(path.join(this.uploadDir, 'images'), { recursive: true });
      await fs.mkdir(path.join(this.uploadDir, 'thumbnails'), { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create upload directories: ${error.message}`);
    }
  }

  /**
   * Validate file before upload
   */
  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
  }

  /**
   * Upload and process an image
   */
  async uploadImage(
    file: Express.Multer.File,
    options: FileUploadOptions = {},
  ): Promise<UploadedFile> {
    this.validateFile(file);

    const fileId = crypto.randomUUID();
    const fileExt = options.compressImage !== false ? 'webp' : path.extname(file.originalname);
    const fileName = `${fileId}${fileExt.startsWith('.') ? fileExt : '.' + fileExt}`;
    const thumbnailName = `${fileId}_thumb.webp`;

    const imagePath = path.join(this.uploadDir, 'images', fileName);
    const thumbnailPath = path.join(this.uploadDir, 'thumbnails', thumbnailName);

    try {
      // Process and compress the image
      let imageProcessor = sharp(file.buffer);

      // Get image metadata
      const metadata = await imageProcessor.metadata();

      // Resize if larger than max dimension
      if (
        metadata.width &&
        metadata.height &&
        (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION)
      ) {
        imageProcessor = imageProcessor.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP for optimal compression
      if (options.compressImage !== false) {
        imageProcessor = imageProcessor.webp({ quality: COMPRESSION_QUALITY });
      }

      // Save the processed image
      const processedBuffer = await imageProcessor.toBuffer();
      await fs.writeFile(imagePath, processedBuffer);

      // Generate thumbnail if requested
      if (options.generateThumbnail !== false) {
        await sharp(file.buffer)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'center',
          })
          .webp({ quality: 70 })
          .toFile(thumbnailPath);
      }

      // Create attachment record if messageId provided
let attachmentId = fileId as `${string}-${string}-${string}-${string}-${string}`;
      if (options.messageId) {
        const attachment = this.attachmentRepository.create({
          id: fileId,
          messageId: options.messageId,
          fileName: file.originalname,
          filePath: imagePath,
          fileSize: processedBuffer.length,
          fileType: 'image/webp',
          isImage: true,
          isDocument: false,
        });

        const saved = await this.attachmentRepository.save(attachment);
        attachmentId = saved.id as `${string}-${string}-${string}-${string}-${string}`;

      }

      this.logger.log(`Image uploaded successfully: ${fileName}`);

      return {
        id: attachmentId,
        url: `${this.baseUrl}/api/v1/files/images/${fileName}`,
        thumbnailUrl: `${this.baseUrl}/api/v1/files/thumbnails/${thumbnailName}`,
        fileName: file.originalname,
        fileSize: processedBuffer.length,
        mimeType: 'image/webp',
      };
    } catch (error) {
      this.logger.error(`Failed to process image: ${error.message}`);
      throw new BadRequestException('Failed to process image');
    }
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: string): Promise<MessageAttachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: fileId },
    });

    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    return attachment;
  }

  /**
   * Get file buffer for serving
   */
  async getFileBuffer(type: 'images' | 'thumbnails', fileName: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, type, fileName);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new NotFoundException('File not found');
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string): Promise<void> {
    const attachment = await this.getFile(fileId);

    try {
      // Delete main file
      await fs.unlink(attachment.filePath);

      // Try to delete thumbnail
      const thumbnailPath = attachment.filePath.replace('/images/', '/thumbnails/').replace(/\.[^.]+$/, '_thumb.webp');
      try {
        await fs.unlink(thumbnailPath);
      } catch {
        // Thumbnail might not exist
      }

      // Delete database record
      await this.attachmentRepository.delete(fileId);

      this.logger.log(`File deleted: ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new BadRequestException('Failed to delete file');
    }
  }

  /**
   * Link attachment to message
   */
  async linkToMessage(attachmentId: string, messageId: string): Promise<MessageAttachment> {
    const attachment = await this.getFile(attachmentId);
    
    attachment.messageId = messageId;
    return this.attachmentRepository.save(attachment);
  }

  /**
   * Get attachments for a message
   */
  async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return this.attachmentRepository.find({
      where: { messageId },
      order: { createdAt: 'ASC' },
    });
  }
}
