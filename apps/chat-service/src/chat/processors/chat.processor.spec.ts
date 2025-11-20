import { Test, TestingModule } from '@nestjs/testing';
import { ChatProcessor } from './chat.processor';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, SenderType } from '../entities/chat-message.entity';
import { ChatSessionSummary } from '../entities/chat-session-summary.entity';
import { AIService } from '../../ai/ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

describe('ChatProcessor', () => {
  let processor: ChatProcessor;
  let chatSessionRepository: any;
  let chatMessageRepository: any;
  let chatSessionSummaryRepository: any;
  let aiService: any;
  let eventEmitter: any;
  let notificationClient: any;

  const mockChatSessionRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockChatMessageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };

  const mockChatSessionSummaryRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAiService = {
    generateSessionSummary: jest.fn(),
    extractKeyTopics: jest.fn(),
    analyzeSessionSentiment: jest.fn(),
    shouldFlagMessage: jest.fn(),
    analyzeSentiment: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockNotificationClient = {
    emit: jest.fn().mockReturnThis(),
    toPromise: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatProcessor,
        { provide: getRepositoryToken(ChatSession), useValue: mockChatSessionRepository },
        { provide: getRepositoryToken(ChatMessage), useValue: mockChatMessageRepository },
        { provide: getRepositoryToken(ChatSessionSummary), useValue: mockChatSessionSummaryRepository },
        { provide: AIService, useValue: mockAiService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: 'NOTIFICATION_SERVICE', useValue: mockNotificationClient },
      ],
    }).compile();

    processor = module.get<ChatProcessor>(ChatProcessor);
    chatSessionRepository = module.get(getRepositoryToken(ChatSession));
    chatMessageRepository = module.get(getRepositoryToken(ChatMessage));
    chatSessionSummaryRepository = module.get(getRepositoryToken(ChatSessionSummary));
    aiService = module.get<AIService>(AIService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    notificationClient = module.get('NOTIFICATION_SERVICE');

    // Mock logger
    (processor as any).logger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    };

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleSessionSetup', () => {
    it('should setup session successfully', async () => {
      const job = {
        data: {
          sessionId: 'session-1',
          userId: 'user-1',
          isAnonymous: false,
        },
      } as Job;

      mockChatSessionRepository.findOne.mockResolvedValue({ id: 'session-1' });
      mockChatSessionRepository.update.mockResolvedValue({ affected: 1 });

      await processor.handleSessionSetup(job);

      expect(mockChatSessionRepository.update).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          sessionMetadata: expect.objectContaining({
            setupComplete: true,
            userType: 'registered',
          }),
        }),
      );
    });

    it('should throw error if session not found', async () => {
      const job = {
        data: { sessionId: 'session-1' },
      } as Job;

      mockChatSessionRepository.findOne.mockResolvedValue(null);

      await expect(processor.handleSessionSetup(job)).rejects.toThrow('Session session-1 not found');
    });
  });

  describe('handleSendWelcomeMessage', () => {
    it('should send welcome message', async () => {
      const job = {
        data: { sessionId: 'session-1' },
      } as Job;

      const mockMessage = { id: 'msg-1', content: 'Welcome' };
      mockChatMessageRepository.create.mockReturnValue(mockMessage);
      mockChatMessageRepository.save.mockResolvedValue(mockMessage);

      await processor.handleSendWelcomeMessage(job);

      expect(mockChatMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          senderType: SenderType.AI,
        }),
      );
      expect(mockChatMessageRepository.save).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('handleSessionCleanup', () => {
    it('should generate summary if not exists', async () => {
      const job = {
        data: { sessionId: 'session-1', messageCount: 5, duration: 100 },
      } as Job;

      const messages = [{ content: 'Hello', senderType: 'user' }];
      mockChatMessageRepository.find.mockResolvedValue(messages);
      mockChatSessionSummaryRepository.findOne.mockResolvedValue(null);
      mockAiService.generateSessionSummary.mockResolvedValue('Summary');
      mockAiService.extractKeyTopics.mockResolvedValue(['Topic']);
      mockAiService.analyzeSessionSentiment.mockResolvedValue(0.5);
      mockChatSessionSummaryRepository.create.mockReturnValue({ id: 'summary-1' });
      mockChatSessionSummaryRepository.save.mockResolvedValue({ id: 'summary-1' });

      await processor.handleSessionCleanup(job);

      expect(mockAiService.generateSessionSummary).toHaveBeenCalled();
      expect(mockChatSessionSummaryRepository.save).toHaveBeenCalled();
    });
  });

  describe('handleFlagForReview', () => {
    it('should flag message and notify admin', async () => {
      const job = {
        data: {
          messageId: 'msg-1',
          sessionId: 'session-1',
          flagReason: 'abuse',
        },
      } as Job;

      mockChatMessageRepository.update.mockResolvedValue({ affected: 1 });

      await processor.handleFlagForReview(job);

      expect(mockChatMessageRepository.update).toHaveBeenCalledWith(
        'msg-1',
        expect.objectContaining({
          isFlagged: true,
          flagReason: 'abuse',
        }),
      );
      expect(mockNotificationClient.emit).toHaveBeenCalledWith(
        'admin.notification',
        expect.objectContaining({
          type: 'message_flagged',
          reason: 'abuse',
        }),
      );
    });
  });

  describe('handleContentModeration', () => {
    it('should flag message if AI detects issues', async () => {
      const job = {
        data: {
          messageId: 'msg-1',
          content: 'bad content',
          sessionId: 'session-1',
        },
      } as Job;

      mockAiService.shouldFlagMessage.mockResolvedValue({
        shouldFlag: true,
        reason: 'inappropriate',
      });

      await processor.handleContentModeration(job);

      expect(mockChatMessageRepository.update).toHaveBeenCalledWith(
        'msg-1',
        expect.objectContaining({
          isFlagged: true,
          flagReason: 'inappropriate',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'content.flagged',
        expect.any(Object),
      );
    });

    it('should not flag if AI says safe', async () => {
      const job = {
        data: {
          messageId: 'msg-1',
          content: 'good content',
          sessionId: 'session-1',
        },
      } as Job;

      mockAiService.shouldFlagMessage.mockResolvedValue({
        shouldFlag: false,
      });

      await processor.handleContentModeration(job);

      expect(mockChatMessageRepository.update).not.toHaveBeenCalled();
    });
  });
});
