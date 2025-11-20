import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatService } from './chat.service';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { AIService } from '../../ai/ai.service';
import { CreateSessionDto, SessionType } from '../dto/create-session.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;
  let chatSessionRepository: any;
  let chatMessageRepository: any;
  let aiService: any;
  let eventEmitter: any;

  const mockChatSessionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const mockChatMessageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ averageSentiment: '0.5' }),
    })),
  };

  const mockChatSessionSummaryRepository = {};
  const mockMessageAttachmentRepository = {};

  const mockAIService = {
    generateResponse: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(ChatSession),
          useValue: mockChatSessionRepository,
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockChatMessageRepository,
        },
        {
          provide: getRepositoryToken(ChatSessionSummary),
          useValue: mockChatSessionSummaryRepository,
        },
        {
          provide: getRepositoryToken(MessageAttachment),
          useValue: mockMessageAttachmentRepository,
        },
        {
          provide: AIService,
          useValue: mockAIService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    chatSessionRepository = module.get(getRepositoryToken(ChatSession));
    chatMessageRepository = module.get(getRepositoryToken(ChatMessage));
    aiService = module.get(AIService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const createSessionDto: CreateSessionDto = {
        userId: 'user-1',
        sessionType: SessionType.ANONYMOUS,
      };

      const savedSession = {
        id: 'session-1',
        ...createSessionDto,
        sessionToken: 'token',
        isAnonymous: false,
        isActive: true,
      };

      mockChatSessionRepository.create.mockReturnValue(savedSession);
      mockChatSessionRepository.save.mockResolvedValue(savedSession);

      const result = await service.createSession(createSessionDto);

      expect(result).toEqual(savedSession);
      expect(mockChatSessionRepository.create).toHaveBeenCalled();
      expect(mockChatSessionRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('session.created', expect.any(Object));
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', async () => {
      const session = { id: 'session-1' };
      mockChatSessionRepository.findOne.mockResolvedValue(session);

      const result = await service.getSession('session-1');

      expect(result).toEqual(session);
      expect(mockChatSessionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-1' } }),
      );
    });

    it('should throw NotFoundException if session not found', async () => {
      mockChatSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.getSession('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      const sendMessageDto: SendMessageDto = {
        sessionId: 'session-1',
        content: 'Hello',
        senderType: SenderType.USER,
        senderId: 'user-1',
      };

      const session = { id: 'session-1', isActive: true };
      const savedMessage = { id: 'msg-1', ...sendMessageDto };

      mockChatSessionRepository.findOne.mockResolvedValue(session);
      mockChatMessageRepository.create.mockReturnValue(savedMessage);
      mockChatMessageRepository.save.mockResolvedValue(savedMessage);
      mockChatMessageRepository.find.mockResolvedValue([]); // For AI response history
      mockAIService.generateResponse.mockResolvedValue({ content: 'AI Response' });

      const result = await service.sendMessage(sendMessageDto);

      expect(result).toEqual(savedMessage);
      expect(mockChatMessageRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('message.sent', expect.any(Object));
    });

    it('should throw BadRequestException if session is inactive', async () => {
      const sendMessageDto: SendMessageDto = {
        sessionId: 'session-1',
        content: 'Hello',
        senderType: SenderType.USER,
      };

      const session = { id: 'session-1', isActive: false };
      mockChatSessionRepository.findOne.mockResolvedValue(session);

      await expect(service.sendMessage(sendMessageDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('endSession', () => {
    it('should end a session', async () => {
      const session = { id: 'session-1', isActive: true, userId: 'user-1', startedAt: new Date() };
      mockChatSessionRepository.findOne.mockResolvedValue(session);
      mockChatSessionRepository.save.mockImplementation((s) => Promise.resolve(s));
      mockChatMessageRepository.count.mockResolvedValue(5);

      const result = await service.endSession({ sessionId: 'session-1' });

      expect(result.isActive).toBe(false);
      expect(result.endedAt).toBeDefined();
      expect(eventEmitter.emit).toHaveBeenCalledWith('session.ended', expect.any(Object));
    });
  });
});
