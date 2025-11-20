import { Test, TestingModule } from '@nestjs/testing';
import { WebSearchService } from './web-search.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { Logger } from '@nestjs/common';

// Define the token manually since import is failing
const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('WebSearchService', () => {
  let service: WebSearchService;
  let configService: ConfigService;
  let httpService: HttpService;
  let redis: any;

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => defaultValue),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    lpush: jest.fn(),
    ltrim: jest.fn(),
    expire: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSearchService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: REDIS_TOKEN, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<WebSearchService>(WebSearchService);
    configService = module.get<ConfigService>(ConfigService);
    httpService = module.get<HttpService>(HttpService);
    redis = module.get(REDIS_TOKEN);

    // Mock logger
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

  describe('search', () => {
    it('should return cached results if available', async () => {
      const query = 'test';
      const cachedResponse = {
        query,
        results: [{ title: 'Cached', url: 'http://cached.com', content: 'Cached content', score: 1 }],
        totalResults: 1,
        searchTime: 10,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await service.search(query, 'user-1');

      expect(result).toEqual(cachedResponse);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('should perform search if cache miss', async () => {
      const query = 'test';
      mockRedis.get.mockResolvedValue(null);

      const mockApiResponse = {
        data: {
          results: [
            { text: 'Result 1', href: 'http://result1.com' },
          ],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockApiResponse));

      const result = await service.search(query, 'user-1');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Result 1');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const query = 'test';
      mockRedis.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(throwError(() => new Error('API Error')));

      await expect(service.search(query, 'user-1')).rejects.toThrow('Web search service temporarily unavailable');
    });
  });

  describe('shouldPerformSearch', () => {
    it('should return true for search triggers', () => {
      expect(service.shouldPerformSearch('what is the latest news')).toBe(true);
      expect(service.shouldPerformSearch('search for cats')).toBe(true);
    });

    it('should return false for normal chat', () => {
      expect(service.shouldPerformSearch('hello how are you')).toBe(false);
    });
  });

  describe('extractSearchQuery', () => {
    it('should extract query from message', () => {
      expect(service.extractSearchQuery('search for cats')).toBe('cats');
      expect(service.extractSearchQuery('what is the weather')).toBe('the weather');
    });
  });
});
