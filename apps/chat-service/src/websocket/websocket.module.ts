// apps/chat-service/src/websocket/websocket.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import {
  ClientsModule,
  Transport,
  TcpClientOptions,
  RmqOptions,
} from '@nestjs/microservices';

// WebSocket Components
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { ConnectionManager } from './connection.manager';

// Guards
import { WsAuthGuard } from './guards/ws-auth.guard';
import { WsThrottleGuard } from './guards/ws-throttle.guard';

// Processors
import { MessageProcessingProcessor } from './processors/message-processing.processor';
import { AIResponseProcessor } from './processors/ai-response.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';

// Entities
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

// Import auth guards for HTTP fallbacks
import { JwtAuthGuard } from '../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth-service/src/auth/guards/roles.guard';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';
import { AIService } from '../ai/ai.service';
import { AiModule } from '../ai/ai.module';
import { HttpModule, HttpService } from '@nestjs/axios';
import { EnhancedAIService } from '../ai/web-ai.service';
import { WebSearchModule } from '../web-search/web-search.module';
import { PreferencesService } from 'apps/user-service/src/preferences/preferences.service';
import { PreferencesModule } from 'apps/user-service/src/preferences/preferences.module';

@Module({
  imports: [
    AuthCoreModule,
    TypeOrmModule.forFeature([ChatSession, ChatMessage, AiContext]),

    // JWT Configuration for WebSocket authentication
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

    // Redis for WebSocket throttling and connection management
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Support both URL and options-based Redis configuration
        const redisUrl = configService.get<string>('REDIS_URL');
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        const redisDb = configService.get<number>('REDIS_DB', 0);

        if (redisUrl) {
          return {
            type: 'single' as const,
            url: redisUrl,
            options: {
              retryDelayOnFailover: 100,
              enableReadyCheck: false,
              maxRetriesPerRequest: 3,
              lazyConnect: true,
              keepAlive: 30000,
              connectTimeout: 10000,
              commandTimeout: 5000,
            },
          };
        }

        return {
          type: 'single' as const,
          options: {
            host: redisHost,
            port: redisPort,
            password: redisPassword,
            db: redisDb,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            keepAlive: 30000,
            connectTimeout: 10000,
            commandTimeout: 5000,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Bull Queues for background processing
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        const redisDb = configService.get<number>('REDIS_DB', 0);

        if (redisUrl) {
          return {
            redis: redisUrl,
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            },
          };
        }

        return {
          redis: {
            host: redisHost,
            port: redisPort,
            password: redisPassword,
            db: redisDb,
          },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        };
      },
      inject: [ConfigService],
    }),

    // Register specific queues
    BullModule.registerQueue(
      {
        name: 'message-processing',
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      },
      {
        name: 'ai-response',
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          timeout: 30000, // 30 seconds timeout for AI responses
        },
      },
      {
        name: 'analytics',
        defaultJobOptions: {
          removeOnComplete: 200,
          removeOnFail: 100,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      },
      {
        name: 'ai-processing',
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      },
    ),
    BullModule.registerQueue({
      name: 'chat-processing',
    }),

    // HTTP module for AI service communications
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // Microservices communication
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService): TcpClientOptions => ({
          transport: Transport.TCP,
          options: {
            host:
              configService.get<string>('AUTH_SERVICE_HOST') || 'auth-service',
            port: configService.get<number>('AUTH_SERVICE_PORT') || 4000,
          },
        }),
        inject: [ConfigService],
      },
    ]),

    BullModule.registerQueue({
      name: 'chat-processing',
    }),

    WebSearchModule,
    ConfigModule,
    PreferencesModule,
  ],
  providers: [
    WebSocketGateway,
    WebSocketService,
    ConnectionManager,
    AIService,
    EnhancedAIService,
    // PreferencesService,

    // Queue Processors
    MessageProcessingProcessor,
    AIResponseProcessor,
    AnalyticsProcessor,

    // WebSocket-specific guards
    WsAuthGuard,
    WsThrottleGuard,

    // HTTP guards for fallback REST endpoints
    JwtAuthGuard,
    RolesGuard,

    // WebSocket throttle configuration
    {
      provide: 'WS_THROTTLE_CONFIG',
      useFactory: (configService: ConfigService) => ({
        // Message sending limits
        sendMessage: {
          name: 'message',
          ttl: configService.get<number>('WS_MESSAGE_TTL', 60000), // 1 minute
          limit: configService.get<number>('WS_MESSAGE_LIMIT', 30), // 30 messages per minute
        },
        // AI request limits
        requestAI: {
          name: 'ai',
          ttl: configService.get<number>('WS_AI_TTL', 60000), // 1 minute
          limit: configService.get<number>('WS_AI_LIMIT', 10), // 10 AI requests per minute
        },
        // Typing indicators (more lenient)
        typing: {
          name: 'typing',
          ttl: configService.get<number>('WS_TYPING_TTL', 10000), // 10 seconds
          limit: configService.get<number>('WS_TYPING_LIMIT', 20), // 20 typing events per 10 seconds
        },
        // Session management
        joinSession: {
          name: 'join',
          ttl: configService.get<number>('WS_JOIN_TTL', 60000), // 1 minute
          limit: configService.get<number>('WS_JOIN_LIMIT', 10), // 10 joins per minute
        },
        leaveSession: {
          name: 'leave',
          ttl: configService.get<number>('WS_LEAVE_TTL', 60000), // 1 minute
          limit: configService.get<number>('WS_LEAVE_LIMIT', 10), // 10 leaves per minute
        },
        // Reading messages (very lenient)
        markAsRead: {
          name: 'read',
          ttl: configService.get<number>('WS_READ_TTL', 10000), // 10 seconds
          limit: configService.get<number>('WS_READ_LIMIT', 50), // 50 read marks per 10 seconds
        },
        // Default for unknown events
        default: {
          name: 'default',
          ttl: configService.get<number>('WS_DEFAULT_TTL', 60000), // 1 minute
          limit: configService.get<number>('WS_DEFAULT_LIMIT', 100), // 100 requests per minute
        },
      }),
      inject: [ConfigService],
    },

    // Connection manager configuration
    {
      provide: 'CONNECTION_CONFIG',
      useFactory: (configService: ConfigService) => ({
        maxConnections: configService.get<number>('WS_MAX_CONNECTIONS', 1000),
        connectionTimeout: configService.get<number>(
          'WS_CONNECTION_TIMEOUT',
          30000,
        ),
        heartbeatInterval: configService.get<number>(
          'WS_HEARTBEAT_INTERVAL',
          25000,
        ),
        maxIdleTime: configService.get<number>('WS_MAX_IDLE_TIME', 300000), // 5 minutes
        cleanupInterval: configService.get<number>(
          'WS_CLEANUP_INTERVAL',
          60000,
        ), // 1 minute
        rateLimitWindow: configService.get<number>(
          'WS_RATE_LIMIT_WINDOW',
          60000,
        ),
        rateLimitMax: configService.get<number>('WS_RATE_LIMIT_MAX', 100),
      }),
      inject: [ConfigService],
    },

    // Queue configuration
    {
      provide: 'QUEUE_CONFIG',
      useFactory: (configService: ConfigService) => ({
        messageProcessing: {
          concurrency: configService.get<number>(
            'MESSAGE_PROCESSING_CONCURRENCY',
            5,
          ),
          rateLimiter: {
            max: configService.get<number>('MESSAGE_PROCESSING_RATE_LIMIT', 10),
            duration: configService.get<number>(
              'MESSAGE_PROCESSING_RATE_DURATION',
              1000,
            ),
          },
        },
        aiResponse: {
          concurrency: configService.get<number>('AI_RESPONSE_CONCURRENCY', 3),
          rateLimiter: {
            max: configService.get<number>('AI_RESPONSE_RATE_LIMIT', 5),
            duration: configService.get<number>(
              'AI_RESPONSE_RATE_DURATION',
              1000,
            ),
          },
        },
        analytics: {
          concurrency: configService.get<number>('ANALYTICS_CONCURRENCY', 2),
          rateLimiter: {
            max: configService.get<number>('ANALYTICS_RATE_LIMIT', 20),
            duration: configService.get<number>(
              'ANALYTICS_RATE_DURATION',
              1000,
            ),
          },
        },
      }),
      inject: [ConfigService],
    },
  ],
  exports: [
    WebSocketService,
    ConnectionManager,
    WsAuthGuard,
    WsThrottleGuard,
    JwtModule, // Export for other modules that need JWT
    BullModule, // Export Bull module for other modules
  ],
})
export class WebSocketModule {}
