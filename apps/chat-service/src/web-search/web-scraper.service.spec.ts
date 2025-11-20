import { Test, TestingModule } from '@nestjs/testing';
import { WebScraperService } from './web-scraper.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { Logger } from '@nestjs/common';

// Define the token manually since import is failing
const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('WebScraperService', () => {
  let service: WebScraperService;
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
        WebScraperService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: REDIS_TOKEN, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<WebScraperService>(WebScraperService);
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

  describe('scrapeSearchResults', () => {
    it('should return cached results if available', async () => {
      const query = 'test';
      const cachedResponse = {
        query,
        results: [],
        search_type: 'web',
        totalResults: 0,
        scrapingTime: 10,
        processingStats: {},
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await service.scrapeSearchResults(query, 'user-1');

      expect(result).toEqual(cachedResponse);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('should scrape results if cache miss', async () => {
      const query = 'test';
      mockRedis.get.mockResolvedValue(null);

      const mockWhoogleResponse = {
        data: {
          results: [
            { title: 'Test Result 1', href: 'http://result1.com', text: 'Description with test content' },
          ],
        },
      };

      mockHttpService.get.mockReturnValueOnce(of(mockWhoogleResponse)); // Whoogle call
      // Mock HTML fetch if enabled (it is by default in mockConfigService)
      mockHttpService.get.mockReturnValueOnce(of({ data: '<html><body><p>Content</p></body></html>' }));

      const result = await service.scrapeSearchResults(query, 'user-1');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Test Result 1');
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('scrapeSearchResultsLegacy', () => {
    it('should return legacy format', async () => {
      const query = 'test';
      // Mock scrapeSearchResults implementation or dependencies
      // Here we'll rely on the mocked dependencies behaving as in scrapeSearchResults test
      mockRedis.get.mockResolvedValue(null);
      const mockWhoogleResponse = {
        data: {
          results: [
            { title: 'Test Result 1', href: 'http://result1.com', text: 'Description with test content' },
          ],
        },
      };
      mockHttpService.get.mockReturnValueOnce(of(mockWhoogleResponse));
      mockHttpService.get.mockReturnValueOnce(of({ data: '<html><body><p>Content</p></body></html>' }));

      const result = await service.scrapeSearchResultsLegacy(query, 'user-1');

      expect(result).toHaveProperty('results');
      expect(result.results[0]).toHaveProperty('snippet');
    });
  });
});
