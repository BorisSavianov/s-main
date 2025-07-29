// apps/chat-service/src/config/config.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { EnvironmentVariables, Environment, AIProvider } from './env.config';

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    private configService: NestConfigService<EnvironmentVariables, true>,
  ) {
    this.logConfiguration();
  }

  // Application Config
  get nodeEnv(): Environment {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.configService.get('PORT_CHAT', { infer: true });
  }

  get frontendUrl(): string {
    return (
      this.configService.get('FRONTEND_URL', { infer: true }) ||
      'http://localhost:3000'
    );
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === Environment.Development;
  }

  get isProduction(): boolean {
    return this.nodeEnv === Environment.Production;
  }

  get isTest(): boolean {
    return this.nodeEnv === Environment.Test;
  }

  // Database Configuration
  get databaseConfig() {
    return {
      type: 'postgres' as const,
      url: this.configService.get('DATABASE_URL', { infer: true }),
      host: this.configService.get('DB_HOST', { infer: true }),
      port: this.configService.get('DB_PORT', { infer: true }),
      username: this.configService.get('DB_USERNAME', { infer: true }),
      password: this.configService.get('DB_PASSWORD', { infer: true }),
      database: this.configService.get('DB_NAME', { infer: true }),
      synchronize:
        this.isDevelopment &&
        !this.configService.get('DISABLE_SYNC', { infer: true }),
      logging: this.isDevelopment ? 'all' : ['error', 'warn'],

      ssl:
        this.isProduction ||
        this.configService.get('DB_SSL_ENABLED', { infer: true })
          ? {
              rejectUnauthorized: this.configService.get(
                'DB_SSL_REJECT_UNAUTHORIZED',
                { infer: true },
              ),
              ca: this.configService.get('DB_CA_CERT', { infer: true }),
            }
          : false,
      extra: {
        max: this.configService.get('DB_POOL_MAX', { infer: true }),
        idleTimeoutMillis: this.configService.get('DB_IDLE_TIMEOUT', {
          infer: true,
        }),
        connectionTimeoutMillis: this.configService.get(
          'DB_CONNECTION_TIMEOUT',
          { infer: true },
        ),
      },
      autoLoadEntities: true,
      retryAttempts: 3,
      retryDelay: 3000,
      migrationsRun: this.configService.get('DB_RUN_MIGRATIONS', {
        infer: true,
      }),
    };
  }

  // Redis Configuration
  get redisConfig() {
    const url = this.configService.get('REDIS_URL', { infer: true });

    return {
      type: 'single' as const,
      ...(url
        ? { url }
        : {
            options: {
              host: this.configService.get('REDIS_HOST', { infer: true }),
              port: this.configService.get('REDIS_PORT', { infer: true }),
              password: this.configService.get('REDIS_PASSWORD', {
                infer: true,
              }),
              db: this.configService.get('REDIS_DB', { infer: true }),
              keyPrefix: this.configService.get('REDIS_KEY_PREFIX', {
                infer: true,
              }),
              retryDelayOnFailover: 100,
              enableReadyCheck: true,
              maxRetriesPerRequest: 3,
              lazyConnect: true,
              connectTimeout: 10000,
              commandTimeout: 5000,
              family: 4,
              keepAlive: true,
              ...(this.configService.get('REDIS_TLS_ENABLED', {
                infer: true,
              }) && {
                tls: {
                  rejectUnauthorized: this.configService.get(
                    'REDIS_TLS_REJECT_UNAUTHORIZED',
                    { infer: true },
                  ),
                },
              }),
            },
          }),
    };
  }

  // Bull Redis Configuration
  get bullRedisConfig() {
    return {
      redis: {
        host: this.configService.get('REDIS_HOST', { infer: true }),
        port: this.configService.get('REDIS_PORT', { infer: true }),
        password: this.configService.get('REDIS_PASSWORD', { infer: true }),
        db: this.configService.get('REDIS_BULL_DB', { infer: true }),
      },

      // These go at top level, not inside redis:
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,

      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential' as const,
          delay: 2000,
        },
      },
      settings: {
        stalledInterval: 30_000,
        maxStalledCount: 1,
      },
    };
  }

  // AI Configuration
  get aiConfig() {
    const provider = this.configService.get('AI_PROVIDER', { infer: true });

    return {
      provider,
      ollama: {
        baseUrl: this.configService.get('OLLAMA_BASE_URL', { infer: true }),
        defaultModel: this.configService.get('OLLAMA_DEFAULT_MODEL', {
          infer: true,
        }),
        timeout: this.configService.get('OLLAMA_TIMEOUT', { infer: true }),
        maxRetries: this.configService.get('OLLAMA_MAX_RETRIES', {
          infer: true,
        }),
        models: {
          chat: this.configService.get('OLLAMA_CHAT_MODEL', { infer: true }),
          embedding: this.configService.get('OLLAMA_EMBEDDING_MODEL', {
            infer: true,
          }),
          sentiment: this.configService.get('OLLAMA_SENTIMENT_MODEL', {
            infer: true,
          }),
          moderation: this.configService.get('OLLAMA_MODERATION_MODEL', {
            infer: true,
          }),
        },
        defaultOptions: {
          temperature: this.configService.get('OLLAMA_TEMPERATURE', {
            infer: true,
          }),
          top_p: this.configService.get('OLLAMA_TOP_P', { infer: true }),
          max_tokens: this.configService.get('OLLAMA_MAX_TOKENS', {
            infer: true,
          }),
        },
      },
      features: {
        sentimentAnalysis: this.configService.get('AI_SENTIMENT_ANALYSIS', {
          infer: true,
        }),
        contentModeration: this.configService.get('AI_CONTENT_MODERATION', {
          infer: true,
        }),
        sessionSummary: this.configService.get('AI_SESSION_SUMMARY', {
          infer: true,
        }),
        recommendations: this.configService.get('AI_RECOMMENDATIONS', {
          infer: true,
        }),
        embedding: this.configService.get('AI_EMBEDDING', { infer: true }),
        topicExtraction: this.configService.get('AI_TOPIC_EXTRACTION', {
          infer: true,
        }),
      },
      limits: {
        maxMessageLength: this.configService.get('AI_MAX_MESSAGE_LENGTH', {
          infer: true,
        }),
        maxSessionDuration: this.configService.get('AI_MAX_SESSION_DURATION', {
          infer: true,
        }),
        maxMessagesPerSession: this.configService.get(
          'AI_MAX_MESSAGES_PER_SESSION',
          { infer: true },
        ),
        rateLimitPerMinute: this.configService.get('AI_RATE_LIMIT_PER_MINUTE', {
          infer: true,
        }),
      },
      prompts: {
        systemPrompt:
          this.configService.get('AI_SYSTEM_PROMPT', { infer: true }) ||
          this.getDefaultSystemPrompt(),
        sentimentPrompt:
          this.configService.get('AI_SENTIMENT_PROMPT', { infer: true }) ||
          this.getDefaultSentimentPrompt(),
        moderationPrompt:
          this.configService.get('AI_MODERATION_PROMPT', { infer: true }) ||
          this.getDefaultModerationPrompt(),
        summaryPrompt:
          this.configService.get('AI_SUMMARY_PROMPT', { infer: true }) ||
          this.getDefaultSummaryPrompt(),
        recommendationPrompt:
          this.configService.get('AI_RECOMMENDATION_PROMPT', { infer: true }) ||
          this.getDefaultRecommendationPrompt(),
      },
    };
  }

  // Microservices Configuration
  get authServiceConfig() {
    return {
      host: this.configService.get('AUTH_SERVICE_HOST', { infer: true }),
      port: this.configService.get('AUTH_SERVICE_PORT', { infer: true }),
    };
  }

  get rabbitmqConfig() {
    const url = this.configService.get('RABBITMQ_URL', { infer: true });
    return url
      ? {
          urls: [url],
          queue: 'chat_queue',
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
        }
      : null;
  }

  // Throttling Configuration
  get throttleConfig() {
    return {
      throttlers: [
        {
          name: 'short',
          ttl: 1000,
          limit: this.configService.get('THROTTLE_SHORT_LIMIT', {
            infer: true,
          }),
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: this.configService.get('THROTTLE_MEDIUM_LIMIT', {
            infer: true,
          }),
        },
        {
          name: 'long',
          ttl: 60000,
          limit: this.configService.get('THROTTLE_LONG_LIMIT', { infer: true }),
        },
      ],
    };
  }

  // Email Configuration
  get emailConfig() {
    return {
      transport: {
        host: this.configService.get('MAIL_HOST', { infer: true }),
        port: this.configService.get('MAIL_PORT', { infer: true }),
        secure: this.configService.get('MAIL_SECURE', { infer: true }),
        auth: {
          user: this.configService.get('MAIL_USER', { infer: true }),
          pass: this.configService.get('MAIL_PASS', { infer: true }),
        },
      },
      defaults: {
        from: `"${this.configService.get('MAIL_FROM_NAME', { infer: true })}" <${this.configService.get('MAIL_FROM_ADDRESS', { infer: true })}>`,
      },
      adminEmail: this.configService.get('ADMIN_EMAIL', { infer: true }),
      crisisTeamEmail: this.configService.get('CRISIS_TEAM_EMAIL', {
        infer: true,
      }),
    };
  }

  // CORS Configuration
  get corsConfig() {
    return {
      origin: [
        'http://localhost:3000',
        'http://localhost:4000',
        this.frontendUrl,
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    };
  }

  // Default AI Prompts
  private getDefaultSystemPrompt(): string {
    return `You are a supportive mental health AI assistant. You provide empathetic, helpful responses while being careful not to provide medical advice. Always encourage users to seek professional help for serious concerns.

Guidelines:
- Be empathetic and understanding
- Avoid giving medical diagnoses or advice
- Encourage professional help when appropriate
- Maintain confidentiality and respect privacy
- Use active listening techniques
- Provide coping strategies and resources when relevant`;
  }

  private getDefaultSentimentPrompt(): string {
    return `Analyze the emotional sentiment of the following text and respond with only a number between -1.0 (very negative) and 1.0 (very positive), where 0.0 is neutral:

"{text}"

Consider the emotional tone, word choice, and overall mood. Sentiment score:`;
  }

  private getDefaultModerationPrompt(): string {
    return `Analyze the following message for potentially harmful content including:
- Expressions of self-harm or suicide
- Abusive language or harassment
- Inappropriate or explicit content
- Spam or meaningless text

Respond with either "FLAG: [reason]" or "SAFE" only:

"{text}"

Analysis:`;
  }

  private getDefaultSummaryPrompt(): string {
    return `Summarize the key points and themes from this mental health support conversation in 2-3 sentences. Focus on the main concerns discussed, progress made, and any important insights or recommendations provided:

{conversation}

Summary:`;
  }

  private getDefaultRecommendationPrompt(): string {
    return `Based on the following conversation, suggest 3-5 helpful therapeutic recommendations or coping strategies. Format each recommendation as a single sentence on a new line:

{conversation}

Focus on:
- Practical coping strategies
- Self-care activities
- Professional resources
- Mindfulness techniques
- Healthy lifestyle choices

Recommendations:`;
  }

  private logConfiguration(): void {
    this.logger.log('Chat Service Configuration:');
    this.logger.log(`- Environment: ${this.nodeEnv}`);
    this.logger.log(`- Port: ${this.port}`);
    this.logger.log(`- AI Provider: ${this.aiConfig.provider}`);
    this.logger.log(
      `- Database: PostgreSQL (${this.databaseConfig.host || 'URL provided'})`,
    );

    const redis = this.redisConfig;
    if ('options' in redis) {
      this.logger.log(`- Redis: ${redis.options.host}`);
    } else {
      this.logger.log(`- Redis: ${redis.url}`);
    }
  }
}
