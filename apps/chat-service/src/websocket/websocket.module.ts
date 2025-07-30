// apps/chat-service/src/websocket/websocket.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
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

// Entities
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

// Import auth guards for HTTP fallbacks
import { JwtAuthGuard } from '../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth-service/src/auth/guards/roles.guard';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';

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
      // Conditionally add RabbitMQ service only if configured
      ...(process.env.RABBITMQ_URL
        ? [
            {
              name: 'RABBITMQ_SERVICE',
              imports: [ConfigModule],
              useFactory: (configService: ConfigService): RmqOptions => ({
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL')!],
                  queue: configService.get<string>(
                    'RABBITMQ_QUEUE',
                    'chat_queue',
                  ),
                  queueOptions: {
                    durable: true,
                    arguments: {
                      'x-message-ttl': 60000,
                    },
                  },
                  socketOptions: {
                    keepAlive: true,
                    heartbeatIntervalInSeconds: 30,
                    reconnectTimeInSeconds: 1,
                  },
                },
              }),
              inject: [ConfigService],
            },
          ]
        : []),
    ]),

    ConfigModule,
  ],
  providers: [
    WebSocketGateway,
    WebSocketService,
    ConnectionManager,

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
  ],
  exports: [
    WebSocketService,
    ConnectionManager,
    WsAuthGuard,
    WsThrottleGuard,
    JwtModule, // Export for other modules that need JWT
  ],
})
export class WebSocketModule {}
