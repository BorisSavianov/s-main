// apps/chat-service/src/search/search.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchProcessor } from './processors/search.processor';
import { SearchEventListener } from './listeners/search-event.listener';
import { MaintenanceService } from './maintenance.service';

// Import AI module for dependency
import { AiModule } from '../ai/ai.module';

// Entities
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

// Import guards and strategies from auth-service
import { JwtAuthGuard } from '../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth-service/src/auth/guards/roles.guard';
import { JwtStrategy } from '../../../auth-service/src/auth/strategies/jwt.strategy';

import { ClientOptions } from '@elastic/elasticsearch';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';

@Module({
  imports: [
    AuthCoreModule,
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

    // JWT module for authentication
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
          issuer: configService.get<string>('JWT_ISSUER', 'mental-health-auth'),
          audience: configService.get<string>(
            'JWT_AUDIENCE',
            'mental-health-platform',
          ),
        },
      }),
    }),

    // Passport for authentication strategies
    PassportModule.register({ defaultStrategy: 'jwt' }),

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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'search-short',
            ttl: configService.get<number>('SEARCH_SHORT_TTL', 60000), // 1 minute
            limit: configService.get<number>('SEARCH_SHORT_LIMIT', 100), // 100 requests per minute
          },
          {
            name: 'search-long',
            ttl: configService.get<number>('SEARCH_LONG_TTL', 3600000), // 1 hour
            limit: configService.get<number>('SEARCH_LONG_LIMIT', 1000), // 1000 requests per hour
          },
          {
            name: 'search-semantic',
            ttl: configService.get<number>('SEMANTIC_SEARCH_TTL', 60000), // 1 minute
            limit: configService.get<number>('SEMANTIC_SEARCH_LIMIT', 20), // 20 semantic searches per minute
          },
          {
            name: 'search-suggestions',
            ttl: configService.get<number>('SUGGESTIONS_TTL', 10000), // 10 seconds
            limit: configService.get<number>('SUGGESTIONS_LIMIT', 50), // 50 suggestion requests per 10 seconds
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Forward reference to AI module to avoid circular dependencies
    forwardRef(() => AiModule),

    ConfigModule,
  ],

  controllers: [SearchController],

  providers: [
    SearchService,
    SearchProcessor,
    SearchEventListener,
    MaintenanceService,

    // Authentication strategy
    JwtStrategy,

    // Guards
    JwtAuthGuard,
    RolesGuard,

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

  exports: [
    SearchService,
    ElasticsearchModule,
    JwtAuthGuard,
    RolesGuard,
    'SEARCH_CONFIG',
  ],
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
