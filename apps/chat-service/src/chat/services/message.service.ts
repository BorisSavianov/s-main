// apps/chat-service/src/chat/services/message.service.ts
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { SendMessageDto } from '../dto/send-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { MessageResponseDto } from '../dto/message-response.dto';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(MessageAttachment)
    private readonly attachmentRepository: Repository<MessageAttachment>,
    @InjectQueue('message-processing')
    private readonly messageQueue: Queue,
  ) {}

  async sendMessage(
    sendMessageDto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    try {
      // Validate sender requirements
      if (
        sendMessageDto.senderType === SenderType.USER &&
        !sendMessageDto.senderId
      ) {
        throw new BadRequestException(
          'Sender ID is required for user messages',
        );
      }

      const message = this.messageRepository.create({
        sessionId: sendMessageDto.sessionId,
        senderId: sendMessageDto.senderId || null,
        senderType: sendMessageDto.senderType,
        content: sendMessageDto.content.trim(),
        contentType: sendMessageDto.contentType || 'text',
      });

      const savedMessage = await this.messageRepository.save(message);

      // Handle attachments if provided
      if (sendMessageDto.attachmentIds!.length > 0) {
        await this.attachAttachments(
          savedMessage.id,
          sendMessageDto.attachmentIds!,
        );
      }

      // Queue message for processing (sentiment analysis, etc.)
      await this.messageQueue.add('process-message', {
        messageId: savedMessage.id,
        content: savedMessage.content,
        senderType: savedMessage.senderType,
      });

      this.logger.log(
        `Message sent: ${savedMessage.id} in session ${savedMessage.sessionId}`,
      );

      return this.mapToResponseDto(savedMessage);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to send message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getMessage(messageId: string): Promise<MessageResponseDto> {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
        relations: ['attachments'],
      });

      if (!message) {
        throw new NotFoundException(`Message with ID ${messageId} not found`);
      }

      return this.mapToResponseDto(message);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to get message: ${error.message}`, error.stack);
      throw error;
    }
  }

  async queryMessages(queryDto: QueryMessagesDto): Promise<{
    messages: MessageResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const { page = 1, limit = 20 } = queryDto;
      const skip = (page - 1) * limit;

      const whereConditions: any = {};

      if (queryDto.sessionId) {
        whereConditions.sessionId = queryDto.sessionId;
      }

      if (queryDto.senderId) {
        whereConditions.senderId = queryDto.senderId;
      }

      if (queryDto.senderType) {
        whereConditions.senderType = queryDto.senderType;
      }

      if (queryDto.flaggedOnly !== undefined) {
        whereConditions.isFlagged = queryDto.flaggedOnly;
      }

      // Date range filtering
      if (queryDto.fromDate || queryDto.toDate) {
        const fromDate = queryDto.fromDate
          ? new Date(queryDto.fromDate)
          : new Date('1900-01-01');
        const toDate = queryDto.toDate ? new Date(queryDto.toDate) : new Date();
        whereConditions.createdAt = Between(fromDate, toDate);
      }

      const [messages, total] = await this.messageRepository.findAndCount({
        where: whereConditions,
        relations: ['attachments'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

      return {
        messages: messages.map((message) => this.mapToResponseDto(message)),
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(
        `Failed to query messages: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateMessage(
    messageId: string,
    updateDto: UpdateMessageDto,
  ): Promise<MessageResponseDto> {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
        relations: ['attachments'],
      });

      if (!message) {
        throw new NotFoundException(`Message with ID ${messageId} not found`);
      }

      // Update fields
      if (updateDto.content !== undefined) {
        message.content = updateDto.content.trim();
      }

      if (updateDto.isFlagged !== undefined) {
        message.isFlagged = updateDto.isFlagged;
      }

      if (updateDto.flagReason !== undefined) {
        message.flagReason = updateDto.flagReason;
      }

      if (updateDto.sentimentScore !== undefined) {
        message.sentimentScore = updateDto.sentimentScore;
      }

      const updatedMessage = await this.messageRepository.save(message);

      this.logger.log(`Updated message: ${messageId}`);

      return this.mapToResponseDto(updatedMessage);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      const result = await this.messageRepository.delete(messageId);

      if (result.affected === 0) {
        throw new NotFoundException(`Message with ID ${messageId} not found`);
      }

      this.logger.log(`Deleted message: ${messageId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getSessionMessages(
    sessionId: string,
    limit = 50,
  ): Promise<MessageResponseDto[]> {
    try {
      const messages = await this.messageRepository.find({
        where: { sessionId },
        relations: ['attachments'],
        order: { createdAt: 'ASC' },
        take: limit,
      });

      return messages.map((message) => this.mapToResponseDto(message));
    } catch (error) {
      this.logger.error(
        `Failed to get session messages: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getRecentMessages(
    sessionId: string,
    limit = 10,
  ): Promise<ChatMessage[]> {
    try {
      return await this.messageRepository.find({
        where: { sessionId },
        order: { createdAt: 'DESC' },
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get recent messages: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  async flagMessage(
    messageId: string,
    reason: string,
  ): Promise<MessageResponseDto> {
    try {
      const updateDto: UpdateMessageDto = {
        isFlagged: true,
        flagReason: reason,
      };

      return await this.updateMessage(messageId, updateDto);
    } catch (error) {
      this.logger.error(
        `Failed to flag message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async unflagMessage(messageId: string): Promise<MessageResponseDto> {
    try {
      const updateDto: UpdateMessageDto = {
        isFlagged: false,
        flagReason: undefined,
      };

      return await this.updateMessage(messageId, updateDto);
    } catch (error) {
      this.logger.error(
        `Failed to unflag message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async attachAttachments(
    messageId: string,
    attachmentIds: string[],
  ): Promise<void> {
    try {
      await this.attachmentRepository.update(
        { id: In(attachmentIds) },
        { messageId },
      );
    } catch (error) {
      this.logger.error(
        `Failed to attach attachments: ${error.message}`,
        error.stack,
      );
    }
  }

  private mapToResponseDto(message: ChatMessage): MessageResponseDto {
    return {
      id: message.id,
      sessionId: message.sessionId,
      senderId: message.senderId,
      senderType: message.senderType,
      content: message.content,
      contentType: message.contentType,
      sentimentScore: message.sentimentScore,
      isFlagged: message.isFlagged,
      flagReason: message.flagReason,
      createdAt: message.createdAt,
      attachments: message.attachments || [],
    };
  }
}
