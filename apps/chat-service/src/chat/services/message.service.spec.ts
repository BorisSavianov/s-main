import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { MessageService } from './message.service';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { SendMessageDto } from '../dto/send-message.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('MessageService', () => {
  let service: MessageService;
  let messageRepository: any;
  let attachmentRepository: any;
  let messageQueue: any;

  const mockMessageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockAttachmentRepository = {
    update: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockMessageRepository,
        },
        {
          provide: getRepositoryToken(MessageAttachment),
          useValue: mockAttachmentRepository,
        },
        {
          provide: getQueueToken('message-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
    messageRepository = module.get(getRepositoryToken(ChatMessage));
    attachmentRepository = module.get(getRepositoryToken(MessageAttachment));
    messageQueue = module.get(getQueueToken('message-processing'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const sendMessageDto: SendMessageDto = {
        sessionId: 'session-1',
        content: 'Hello',
        senderType: SenderType.USER,
        senderId: 'user-1',
        attachmentIds: [],
      };

      const savedMessage = { id: 'msg-1', ...sendMessageDto };

      mockMessageRepository.create.mockReturnValue(savedMessage);
      mockMessageRepository.save.mockResolvedValue(savedMessage);

      const result = await service.sendMessage(sendMessageDto);

      expect(result.id).toBe('msg-1');
      expect(mockMessageRepository.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('process-message', expect.any(Object));
    });

    it('should throw BadRequestException if senderId missing for USER', async () => {
      const sendMessageDto: SendMessageDto = {
        sessionId: 'session-1',
        content: 'Hello',
        senderType: SenderType.USER,
      };

      await expect(service.sendMessage(sendMessageDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMessage', () => {
    it('should return a message', async () => {
      const message = { id: 'msg-1', content: 'Hello' };
      mockMessageRepository.findOne.mockResolvedValue(message);

      const result = await service.getMessage('msg-1');

      expect(result.id).toBe('msg-1');
    });

    it('should throw NotFoundException if message not found', async () => {
      mockMessageRepository.findOne.mockResolvedValue(null);

      await expect(service.getMessage('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMessage', () => {
    it('should update a message', async () => {
      const message = { id: 'msg-1', content: 'Old' };
      mockMessageRepository.findOne.mockResolvedValue(message);
      mockMessageRepository.save.mockImplementation((m) => Promise.resolve(m));

      const result = await service.updateMessage('msg-1', { content: 'New' });

      expect(result.content).toBe('New');
      expect(mockMessageRepository.save).toHaveBeenCalled();
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      mockMessageRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteMessage('msg-1');

      expect(mockMessageRepository.delete).toHaveBeenCalledWith('msg-1');
    });

    it('should throw NotFoundException if delete fails', async () => {
      mockMessageRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.deleteMessage('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });
});
