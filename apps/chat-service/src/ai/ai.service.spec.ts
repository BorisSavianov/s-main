import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiContext } from './entities/ai-context.entity';
import { getQueueToken } from '@nestjs/bull';
import { of, throwError } from 'rxjs';
import { Logger } from '@nestjs/common';

describe('AIService', () => {
  let service: AIService;
  let configService: ConfigService;
  let httpService: HttpService;
  let aiContextRepository: any;
  let aiQueue: any;

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => defaultValue),
  };

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockAiContextRepository = {
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockAiQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: getRepositoryToken(AiContext), useValue: mockAiContextRepository },
        { provide: getQueueToken('ai-processing'), useValue: mockAiQueue },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
    configService = module.get<ConfigService>(ConfigService);
    httpService = module.get<HttpService>(HttpService);
    aiContextRepository = module.get(getRepositoryToken(AiContext));
    aiQueue = module.get(getQueueToken('ai-processing'));

    // Mock private logger to avoid console noise
    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResponse', () => {
    it('should generate a response successfully', async () => {
      const context = {
        sessionId: 'session-1',
        recentMessages: [],
        userMessage: 'Hello',
      };

      const mockOllamaResponse = {
        data: {
          response: 'Hello there!',
          done: true,
        },
      };

      // Mock storeContext
      jest.spyOn(service as any, 'storeContext').mockResolvedValue(undefined);
      // Mock buildPrompt
      jest.spyOn(service as any, 'buildPrompt').mockResolvedValue('prompt');
      // Mock callOllama
      jest.spyOn(service as any, 'callOllama').mockResolvedValue(mockOllamaResponse.data);
      // Mock analyzeSentiment
      jest.spyOn(service, 'analyzeSentiment').mockResolvedValue(0.5);
      // Mock queueBackgroundTasks
      jest.spyOn(service as any, 'queueBackgroundTasks').mockResolvedValue(undefined);
      // Mock calculateConfidence
      jest.spyOn(service as any, 'calculateConfidence').mockReturnValue(0.9);

      const result = await service.generateResponse(context);

      expect(result).toEqual({
        content: 'Hello there!',
        sentiment: 0.5,
        confidence: 0.9,
      });
    });

    it('should handle errors gracefully', async () => {
      const context = {
        sessionId: 'session-1',
        recentMessages: [],
        userMessage: 'Hello',
      };

      jest.spyOn(service as any, 'storeContext').mockRejectedValue(new Error('DB Error'));

      const result = await service.generateResponse(context);

      expect(result.content).toContain("I'm having trouble processing your message");
      expect(result.sentiment).toBe(0);
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze sentiment correctly', async () => {
      const text = 'I am happy';
      const mockResponse = {
        response: '0.8',
        done: true,
      };

      jest.spyOn(service as any, 'callOllama').mockResolvedValue(mockResponse);

      const result = await service.analyzeSentiment(text);

      expect(result).toBe(0.8);
    });

    it('should return 0 on error', async () => {
      const text = 'I am happy';
      jest.spyOn(service as any, 'callOllama').mockRejectedValue(new Error('API Error'));

      const result = await service.analyzeSentiment(text);

      expect(result).toBe(0);
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const text = 'test text';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResponse = {
        data: {
          embedding: mockEmbedding,
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.generateEmbedding(text);

      expect(result).toEqual(mockEmbedding);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/embeddings'),
        expect.objectContaining({ prompt: text }),
        expect.any(Object),
      );
    });

    it('should return null on error', async () => {
      const text = 'test text';
      mockHttpService.post.mockReturnValue(throwError(() => new Error('API Error')));

      const result = await service.generateEmbedding(text);

      expect(result).toBeNull();
    });
  });

  describe('shouldFlagMessage', () => {
    it('should flag harmful content', async () => {
      const content = 'bad content';
      const mockResponse = {
        response: 'FLAG: inappropriate content',
        done: true,
      };

      jest.spyOn(service as any, 'callOllama').mockResolvedValue(mockResponse);

      const result = await service.shouldFlagMessage(content);

      expect(result.shouldFlag).toBe(true);
      expect(result.reason).toBe('INAPPROPRIATE CONTENT');
    });

    it('should not flag safe content', async () => {
      const content = 'good content';
      const mockResponse = {
        response: 'SAFE',
        done: true,
      };

      jest.spyOn(service as any, 'callOllama').mockResolvedValue(mockResponse);

      const result = await service.shouldFlagMessage(content);

      expect(result.shouldFlag).toBe(false);
    });
  });
});
