import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatEventHandlersService } from './chat-event-handlers.listener';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { AIService } from '../../ai/ai.service';

describe('ChatEventHandlersService', () => {
  let service: ChatEventHandlersService;
  let chatSessionRepository: any;
  let chatMessageRepository: any;
  let chatQueue: any;
  let aiQueue: any;
  let eventEmitter: any;

  const mockChatSessionRepository = {
    update: jest.fn(),
  };

  const mockChatMessageRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    })),
  };

  const mockChatSessionSummaryRepository = {};

  const mockQueue = {
    add: jest.fn(),
  };

  const mockAIService = {};

  const mockEventEmitter = {
    eventNames: jest.fn().mockReturnValue([]),
    listenerCount: jest.fn().mockReturnValue(0),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatEventHandlersService,
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
          provide: getQueueToken('chat-processing'),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken('ai-processing'),
          useValue: mockQueue,
        },
        {
          provide: AIService,
          useValue: mockAIService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<ChatEventHandlersService>(ChatEventHandlersService);
    chatSessionRepository = module.get(getRepositoryToken(ChatSession));
    chatMessageRepository = module.get(getRepositoryToken(ChatMessage));
    chatQueue = module.get(getQueueToken('chat-processing'));
    aiQueue = module.get(getQueueToken('ai-processing'));
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleSessionCreated', () => {
    it('should queue session setup', async () => {
      const event = { sessionId: 'session-1', userId: 'user-1', isAnonymous: false };
      await service.handleSessionCreated(event);
      expect(chatQueue.add).toHaveBeenCalledWith('session-setup', event, expect.any(Object));
    });

    it('should queue welcome message for anonymous sessions', async () => {
      const event = { sessionId: 'session-1', isAnonymous: true };
      await service.handleSessionCreated(event);
      expect(chatQueue.add).toHaveBeenCalledWith('send-welcome-message', { sessionId: 'session-1' }, expect.any(Object));
    });
  });

  describe('handleSessionEnded', () => {
    it('should queue summary generation and cleanup', async () => {
      const event = { sessionId: 'session-1', messageCount: 10, duration: 100 };
      mockChatMessageRepository.find.mockResolvedValue([]);
      
      // Mock query builder for updateSessionMetrics
      const queryBuilderMock = {
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ avgSentiment: 0.5, negativeMessages: 1, positiveMessages: 5 }),
      };
      mockChatMessageRepository.createQueryBuilder.mockReturnValue(queryBuilderMock);

      await service.handleSessionEnded(event);

      expect(aiQueue.add).toHaveBeenCalledWith('generate-summary', expect.any(Object), expect.any(Object));
      expect(chatQueue.add).toHaveBeenCalledWith('session-cleanup', expect.any(Object), expect.any(Object));
      expect(mockChatSessionRepository.update).toHaveBeenCalled();
    });
  });

  describe('handleMessageSent', () => {
    it('should queue content moderation', async () => {
      const event = { messageId: 'msg-1', sessionId: 'session-1', senderType: 'user', content: 'hello' };
      await service.handleMessageSent(event);
      expect(chatQueue.add).toHaveBeenCalledWith('moderate-content', expect.any(Object), expect.any(Object));
    });

    it('should queue sentiment analysis for user messages', async () => {
      const event = { messageId: 'msg-1', sessionId: 'session-1', senderType: 'user', content: 'hello' };
      await service.handleMessageSent(event);
      expect(chatQueue.add).toHaveBeenCalledWith('analyze-sentiment', expect.any(Object), expect.any(Object));
    });
  });

  describe('handleAIResponseGenerated', () => {
    it('should queue response quality analysis', async () => {
      const event = { messageId: 'msg-1', sessionId: 'session-1', content: 'response' };
      mockChatMessageRepository.find.mockResolvedValue([]); // No recent messages for intervention check
      
      await service.handleAIResponseGenerated(event);
      
      expect(chatQueue.add).toHaveBeenCalledWith('analyze-response-quality', expect.any(Object), expect.any(Object));
    });
  });

  describe('handleContentFlagged', () => {
    it('should update message and emit crisis event', async () => {
      const event = { messageId: 'msg-1', sessionId: 'session-1', flagType: 'self_harm', severity: 'high' };
      
      await service.handleContentFlagged(event);
      
      expect(mockChatMessageRepository.update).toHaveBeenCalledWith('msg-1', expect.objectContaining({ isFlagged: true }));
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.crisis.detected', expect.any(Object));
      expect(chatQueue.add).toHaveBeenCalledWith('immediate-intervention', expect.any(Object), expect.any(Object));
    });
  });
});
