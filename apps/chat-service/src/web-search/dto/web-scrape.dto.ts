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
    description: 'Original search query',
  })
  query: string;

  @ApiProperty({
    description: 'Top search results',
    type: [ScrapedResultDto],
  })
  searchResults: ScrapedResultDto[];

  @ApiProperty({
    description: 'Context summary for AI',
    example:
      'Search results for: "latest news on NVIDIA"\nFound 5 relevant sources...',
  })
  contextSummary: string;

  @ApiProperty({
    description: 'Top source domains',
    type: [String],
    example: ['nvidianews.nvidia.com', 'finance.yahoo.com'],
  })
  topSources: string[];

  @ApiProperty({
    description: 'Relevance threshold used',
    example: 0.6,
  })
  relevanceThreshold: number;

  @ApiProperty({
    description: 'Timestamp of context generation',
    example: '2025-11-10T16:30:40.307Z',
  })
  timestamp: string;
}

/**
 * Response DTO for integrated search
 */
export class IntegratedSearchResponseDto {
  @ApiProperty({
    description: 'AI generated response',
    example: 'Based on recent information, NVIDIA announced...',
  })
  aiResponse: string;

  @ApiProperty({
    description: 'Whether web search was performed',
    example: true,
  })
  webSearchPerformed: boolean;

  @ApiProperty({
    description: 'Search query used',
    example: 'latest news on NVIDIA',
    required: false,
  })
  searchQuery?: string;

  @ApiProperty({
    description: 'Number of sources used',
    example: 5,
  })
  sourcesUsed: number;

  @ApiProperty({
    description: 'Search results context',
    type: EnhancedContextDto,
    required: false,
  })
  searchResults?: EnhancedContextDto;

  @ApiProperty({
    description: 'Total processing time (ms)',
    example: 1523,
  })
  processingTime: number;

  @ApiProperty({
    description: 'Citations extracted from AI response',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        number: { type: 'number', example: 1 },
        source: { type: 'string', example: 'NVIDIA Newsroom' },
        url: {
          type: 'string',
          example: 'https://nvidianews.nvidia.com/news/latest',
        },
      },
    },
    required: false,
  })
  citations?: Array<{ number: number; source: string; url: string }>;
}
