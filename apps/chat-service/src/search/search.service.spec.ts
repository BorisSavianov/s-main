import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { AiContext } from '../ai/entities/ai-context.entity';
import { getQueueToken } from '@nestjs/bull';
import { AIService } from '../ai/ai.service';
import { Logger } from '@nestjs/common';

describe('SearchService', () => {
  let service: SearchService;
  let elasticsearchService: any;
  let messageRepository: any;
  let sessionRepository: any;
  let contextRepository: any;
  let indexingQueue: any;
  let aiService: any;

  const mockElasticsearchService = {
    indices: {
      exists: jest.fn(),
      create: jest.fn(),
    },
    search: jest.fn(),
    index: jest.fn(),
    bulk: jest.fn(),
  };

  const mockMessageRepository = {
    update: jest.fn(),
  };

  const mockSessionRepository = {};
  const mockContextRepository = {};

  const mockIndexingQueue = {
    add: jest.fn(),
  };

  const mockAiService = {
    generateEmbedding: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: ElasticsearchService, useValue: mockElasticsearchService },
        { provide: getRepositoryToken(ChatMessage), useValue: mockMessageRepository },
        { provide: getRepositoryToken(ChatSession), useValue: mockSessionRepository },
        { provide: getRepositoryToken(AiContext), useValue: mockContextRepository },
        { provide: getQueueToken('search-indexing'), useValue: mockIndexingQueue },
        { provide: AIService, useValue: mockAiService },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    elasticsearchService = module.get<ElasticsearchService>(ElasticsearchService);
    messageRepository = module.get(getRepositoryToken(ChatMessage));
    aiService = module.get<AIService>(AIService);

    // Mock logger
    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Clear mocks to reset calls made during constructor/initialization
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeIndices', () => {
    it('should create indices if they do not exist', async () => {
      mockElasticsearchService.indices.exists.mockResolvedValue(false);
      mockElasticsearchService.indices.create.mockResolvedValue({});

      await (service as any).initializeIndices();

      expect(mockElasticsearchService.indices.create).toHaveBeenCalledTimes(2); // message index + suggestion index
    });

    it('should not create indices if they exist', async () => {
      mockElasticsearchService.indices.exists.mockResolvedValue(true);

      await (service as any).initializeIndices();

      expect(mockElasticsearchService.indices.create).not.toHaveBeenCalled();
    });
  });

  describe('searchMessages', () => {
    it('should search messages successfully', async () => {
      const query = { query: 'hello' };
      const mockResponse = {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _source: {
                id: 'msg-1',
                content: 'hello world',
                createdAt: new Date(),
              },
              _score: 1.0,
            },
          ],
        },
        took: 10,
      };

      mockElasticsearchService.search.mockResolvedValue(mockResponse);

      const result = await service.searchMessages(query);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].content).toBe('hello world');
      expect(mockElasticsearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(Object),
        }),
      );
    });
  });

  describe('indexMessage', () => {
    it('should index message with embedding', async () => {
      const message = {
        id: 'msg-1',
        content: 'hello',
        sessionId: 'session-1',
        createdAt: new Date(),
      } as ChatMessage;

      const mockEmbedding = [0.1, 0.2];
      mockAiService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockElasticsearchService.index.mockResolvedValue({});
      mockMessageRepository.update.mockResolvedValue({});

      await service.indexMessage(message);

      expect(mockAiService.generateEmbedding).toHaveBeenCalledWith('hello');
      expect(mockElasticsearchService.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-1',
          content: 'hello',
          embedding: mockEmbedding,
        }),
      );
    });
  });

  describe('getSuggestions', () => {
    it('should return suggestions', async () => {
      const prefix = 'hel';
      const mockCompletionResponse = {
        suggest: {
          content_suggest: [
            {
              options: [
                { text: 'hello', _score: 1.0 },
              ],
            },
          ],
        },
      };

      mockElasticsearchService.search.mockResolvedValueOnce(mockCompletionResponse);
      // Mock searchMessages for phrase suggestions
      jest.spyOn(service, 'searchMessages').mockResolvedValue({
        results: [],
        total: 0,
        took: 0,
        query: '',
      });

      const result = await service.getSuggestions(prefix);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('hello');
    });
  });
});
