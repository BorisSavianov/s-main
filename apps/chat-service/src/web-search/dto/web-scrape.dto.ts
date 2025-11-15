// apps/chat-service/src/web-search/dto/web-scraper.dto.ts
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedSearchResult } from '../web-scraper.service';

/**
 * DTO for scraping web search results
 */
export class ScrapeQueryDto {
  @ApiProperty({
    description: 'Search query to scrape',
    example: 'latest news on NVIDIA',
    maxLength: 200,
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'Maximum number of results to return',
    example: 5,
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxResults?: number;
}

/**
 * DTO for integrated AI search request
 */
export class IntegratedSearchDto {
  @ApiProperty({
    description: 'User message to process',
    example: 'What is the latest news on AI developments?',
    maxLength: 2000,
  })
  @IsString()
  userMessage: string;

  @ApiProperty({
    description: 'Session ID for context',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  sessionId: string;

  @ApiProperty({
    description: 'Whether to perform web search',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  performWebSearch?: boolean;

  @ApiProperty({
    description: 'Maximum number of search results to use',
    example: 5,
    minimum: 1,
    maximum: 10,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxSearchResults?: number;
}

/**
 * Response DTO for scraped results
 */
export class ScrapedResultDto {
  @ApiProperty({
    description: 'Result title',
    example: 'Latest News | NVIDIA Newsroom',
  })
  title: string;

  @ApiProperty({
    description: 'Result URL',
    example: 'https://nvidianews.nvidia.com/news/latest',
  })
  url: string;

  @ApiProperty({
    description: 'Result description',
    example:
      'Fall Into Gaming With 20+ Titles Joining GeForce NOW in November...',
  })
  description: string;

  @ApiProperty({
    description: 'Result snippet',
    example: 'Fall Into Gaming With 20+ Titles...',
  })
  snippet: string;

  @ApiProperty({
    description: 'Relevance score',
    example: 0.95,
    minimum: 0,
    maximum: 1,
  })
  relevanceScore: number;

  @ApiProperty({
    description: 'Result metadata',
    type: 'object',
    properties: {
      domain: { type: 'string', example: 'example.com' },
      publishDate: { type: 'string', example: '2025-11-10', nullable: true },
      contentType: { type: 'string', example: 'article', nullable: true },
    },
  })
  metadata: {
    domain: string;
    publishDate?: string;
    contentType?: string;
  };
}

/**
 * Response DTO for scraper results
 */
export class ScraperResponseDto {
  @ApiProperty({
    description: 'Original search query',
    example: 'latest news on NVIDIA',
  })
  query: string;

  @ApiProperty({
    description: 'Array of scraped results',
    type: [ScrapedResultDto],
  })
  results: ScrapedResultDto[];

  @ApiProperty({
    description: 'Total number of results',
    example: 10,
  })
  totalResults: number;

  @ApiProperty({
    description: 'Time taken to scrape (ms)',
    example: 723,
  })
  scrapingTime: number;

  @ApiProperty({
    description: 'Processing statistics',
    type: 'object',
    properties: {
      totalPages: { type: 'number', example: 5 },
      successfulExtractions: { type: 'number', example: 4 },
      failedExtractions: { type: 'number', example: 1 },
      averageRelevanceScore: { type: 'number', example: 0.87 },
    },
  })
  processingStats: {
    totalPages: number;
    successfulExtractions: number;
    failedExtractions: number;
    averageRelevanceScore: number;
  };
}

/**
 * Response DTO for enhanced AI context
 */
export class EnhancedContextDto {
  @ApiProperty({
    description: 'Original user query that triggered the web search',
    example: 'latest news on NVIDIA',
  })
  query: string;

  @ApiProperty({
    description: 'Normalized list of search results',
  })
  searchResults: NormalizedSearchResult[];

  @ApiProperty({
    description: 'AI-generated summary of the extracted context',
    example:
      'NVIDIA has released new AI integrations and updates across multiple product lines...',
  })
  contextSummary: string;

  @ApiProperty({
    description: 'Top relevant sources ranked by importance',
    example: ['nvidia.com', 'cnbc.com', 'yahoo.com'],
    type: [String],
  })
  topSources: string[];

  @ApiProperty({
    description: 'Cutoff threshold used to filter relevant results',
    example: 0.65,
  })
  relevanceThreshold: number;

  @ApiProperty({
    description: 'Timestamp when the context was generated (ISO 8601)',
    example: '2025-11-15T09:23:41.120Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Extracted full-text HTML content for each visited page',
    type: [String],
    required: false,
    example: [
      'NVIDIA today announced new AI-powered hardware for data centers...',
      'The stock price of NVIDIA increased following strong quarterly earnings...',
    ],
  })
  fullTextContent?: string[];
}

export class IntegratedSearchResponseDto {
  @ApiProperty({
    description: 'AI-generated main response text',
    example: 'Based on recent information, NVIDIA announced...',
  })
  aiResponse: string;

  @ApiProperty({
    description: 'Indicates whether the web search pipeline executed',
    example: true,
  })
  webSearchPerformed: boolean;

  @ApiProperty({
    description: 'Query used for performing the search',
    example: 'latest news on NVIDIA',
    required: false,
  })
  searchQuery?: string;

  @ApiProperty({
    description: 'Number of sources used from the enhanced context',
    example: 5,
  })
  sourcesUsed: number;

  @ApiProperty({
    description: 'The full Enhanced AI context generated from the search',
    type: () => EnhancedContextDto,
    required: false,
  })
  searchResults?: EnhancedContextDto;

  @ApiProperty({
    description: 'Total time the request took to process, in milliseconds',
    example: 1523,
  })
  processingTime: number;

  @ApiProperty({
    description: 'Citation references extracted from the AI response',
    required: false,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        number: {
          type: 'number',
          example: 1,
          description: 'The citation index inside the AI response',
        },
        source: {
          type: 'string',
          example: 'NVIDIA Newsroom',
          description: 'Human-friendly label for the citation source',
        },
        url: {
          type: 'string',
          example: 'https://nvidianews.nvidia.com/news/latest',
          description: 'Canonical source URL',
        },
      },
    },
  })
  citations?: Array<{ number: number; source: string; url: string }>;

  @ApiProperty({
    description: 'Metadata describing how content was processed',
    example: {
      fullContentAvailable: true,
      extractedContentUsed: false,
      confidenceScore: 0.87,
    },
  })
  metadata: {
    fullContentAvailable: boolean;
    extractedContentUsed: boolean;
    confidenceScore: number;
  };
}
