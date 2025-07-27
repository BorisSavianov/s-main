// apps/chat-service/src/search/search.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchProcessor } from './processors/search.processor';
import { SearchEventListener } from './listeners/search-event.listener';

// Import AI module for dependency
import { AiModule } from '../ai/ai.module';

// Entities
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

import { ClientOptions } from '@elastic/elasticsearch';
import * as https from 'https';

@Module({
  imports: [
    // Database entities
    TypeOrmModule.forFeature([ChatMessage, ChatSession, AiContext]),

    // Elasticsearch configuration
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const username = configService.get<string>('ELASTICSEARCH_USERNAME');
        const password = configService.get<string>('ELASTICSEARCH_PASSWORD');

        const config: ClientOptions = {
          node: configService.get<string>(
            'ELASTICSEARCH_URL',
            'http://elasticsearch:9200',
          ),
          maxRetries: 3,
          requestTimeout: 30000,
          sniffOnStart: false,
          sniffOnConnectionFault: false,
          resurrectStrategy: 'ping',
          pingTimeout: 3000,
          compression: true,

          headers: {
            'User-Agent': 'chat-service-search/1.0.0',
          },
        };

        if (username && password) {
          config.auth = { username, password };
        }

        return config;
      },

      inject: [ConfigService],
    }),

    // Bull queue for background processing
    BullModule.registerQueue({
      name: 'search-indexing',
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 10,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
      settings: {
        stalledInterval: 30000,

        maxStalledCount: 1,
      },
    }),

    // Rate limiting for search endpoints
    ThrottlerModule.forRoot([
      {
        name: 'search-short',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
      {
        name: 'search-long',
        ttl: 3600000, // 1 hour
        limit: 1000, // 1000 requests per hour
      },
    ]),

    // Forward reference to AI module to avoid circular dependencies
    forwardRef(() => AiModule),
  ],

  controllers: [SearchController],

  providers: [
    SearchService,
    SearchProcessor,
    SearchEventListener,

    // Additional providers for advanced features
    {
      provide: 'SEARCH_CONFIG',
      useFactory: (configService: ConfigService) => ({
        indexPrefix: configService.get<string>('SEARCH_INDEX_PREFIX', 'chat_'),
        batchSize: configService.get<number>('SEARCH_BATCH_SIZE', 100),
        embeddingDimensions: configService.get<number>(
          'EMBEDDING_DIMENSIONS',
          768,
        ),
        maxSearchResults: configService.get<number>('MAX_SEARCH_RESULTS', 100),
        searchTimeout: configService.get<number>('SEARCH_TIMEOUT', 30000),
        enableSemanticSearch: configService.get<boolean>(
          'ENABLE_SEMANTIC_SEARCH',
          true,
        ),
        enableSearchAnalytics: configService.get<boolean>(
          'ENABLE_SEARCH_ANALYTICS',
          true,
        ),
        cleanupIntervalDays: configService.get<number>(
          'SEARCH_CLEANUP_INTERVAL_DAYS',
          90,
        ),
      }),
      inject: [ConfigService],
    },
  ],

  exports: [SearchService, ElasticsearchModule],
})
export class SearchModule {}

// Additional configuration interface for type safety
export interface SearchConfig {
  indexPrefix: string;
  batchSize: number;
  embeddingDimensions: number;
  maxSearchResults: number;
  searchTimeout: number;
  enableSemanticSearch: boolean;
  enableSearchAnalytics: boolean;
  cleanupIntervalDays: number;
}
