// apps/chat-service/src/config/env.config.ts
import { registerAs } from '@nestjs/config';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsBoolean,
  IsOptional,
  validateSync,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum AIProvider {
  OLLAMA = 'ollama',
  ANTHROPIC = 'anthropic',
}

export class EnvironmentVariables {
  // Application
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Type(() => Number)
  PORT_CHAT: number = 4002;

  @IsString()
  @IsOptional()
  FRONTEND_URL?: string = 'http://localhost:3000';

  // Database
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  DB_HOST: string = 'localhost';

  @IsNumber()
  @Type(() => Number)
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string = 'postgres';

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @IsString()
  DB_NAME: string = 'chat_service';

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  DB_SSL_ENABLED: boolean = false;

  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  DB_SSL_REJECT_UNAUTHORIZED: boolean = true;

  @IsString()
  @IsOptional()
  DB_CA_CERT?: string;

  @IsNumber()
  @Type(() => Number)
  DB_POOL_MAX: number = 20;

  @IsNumber()
  @Type(() => Number)
  DB_IDLE_TIMEOUT: number = 30000;

  @IsNumber()
  @Type(() => Number)
  DB_CONNECTION_TIMEOUT: number = 2000;

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  DB_RUN_MIGRATIONS: boolean = false;

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  DISABLE_SYNC: boolean = false;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @Type(() => Number)
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string = 'mentalhealth2024';

  @IsNumber()
  @Type(() => Number)
  REDIS_DB: number = 0;

  @IsNumber()
  @Type(() => Number)
  REDIS_BULL_DB: number = 1;

  @IsNumber()
  @Type(() => Number)
  REDIS_SESSION_DB: number = 2;

  @IsNumber()
  @Type(() => Number)
  REDIS_CACHE_DB: number = 3;

  @IsString()
  REDIS_KEY_PREFIX: string = 'chat_service:';

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  REDIS_TLS_ENABLED: boolean = false;

  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  REDIS_TLS_REJECT_UNAUTHORIZED: boolean = true;

  // AI Configuration
  @IsEnum(AIProvider)
  AI_PROVIDER: AIProvider = AIProvider.OLLAMA;

  // Ollama
  @IsString()
  OLLAMA_BASE_URL: string = 'http://localhost:11434';

  @IsString()
  OLLAMA_DEFAULT_MODEL: string = 'llama3.2:3b';

  @IsString()
  OLLAMA_CHAT_MODEL: string = 'llama3.2:3b';

  @IsString()
  OLLAMA_EMBEDDING_MODEL: string = 'nomic-embed-text';

  @IsString()
  OLLAMA_SENTIMENT_MODEL: string = 'llama3.2:1b';

  @IsString()
  OLLAMA_MODERATION_MODEL: string = 'llama3.2:1b';

  @IsNumber()
  @Type(() => Number)
  OLLAMA_TIMEOUT: number = 30000;

  @IsNumber()
  @Type(() => Number)
  OLLAMA_MAX_RETRIES: number = 3;

  @IsNumber()
  @Type(() => Number)
  OLLAMA_TEMPERATURE: number = 0.7;

  @IsNumber()
  @Type(() => Number)
  OLLAMA_TOP_P: number = 0.9;

  @IsNumber()
  @Type(() => Number)
  OLLAMA_MAX_TOKENS: number = 256;

  // AI Features
  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  AI_SENTIMENT_ANALYSIS: boolean = true;

  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  AI_CONTENT_MODERATION: boolean = true;

  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  AI_SESSION_SUMMARY: boolean = true;

  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  AI_RECOMMENDATIONS: boolean = true;

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  AI_EMBEDDING: boolean = false;

  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  AI_TOPIC_EXTRACTION: boolean = true;

  // AI Limits
  @IsNumber()
  @Type(() => Number)
  AI_MAX_MESSAGE_LENGTH: number = 4000;

  @IsNumber()
  @Type(() => Number)
  AI_MAX_SESSION_DURATION: number = 120;

  @IsNumber()
  @Type(() => Number)
  AI_MAX_MESSAGES_PER_SESSION: number = 100;

  @IsNumber()
  @Type(() => Number)
  AI_RATE_LIMIT_PER_MINUTE: number = 20;

  // Microservices
  @IsString()
  AUTH_SERVICE_HOST: string = 'auth-service';

  @IsNumber()
  @Type(() => Number)
  AUTH_SERVICE_PORT: number = 4000;

  // Throttling
  @IsNumber()
  @Type(() => Number)
  THROTTLE_SHORT_LIMIT: number = 100;

  @IsNumber()
  @Type(() => Number)
  THROTTLE_MEDIUM_LIMIT: number = 500;

  @IsNumber()
  @Type(() => Number)
  THROTTLE_LONG_LIMIT: number = 1000;

  // Email
  @IsString()
  MAIL_HOST: string;

  @IsNumber()
  @Type(() => Number)
  MAIL_PORT: number;

  @IsBoolean()
  MAIL_SECURE: boolean = true;

  @IsString()
  @IsOptional()
  MAIL_USER?: string;

  @IsString()
  @IsOptional()
  MAIL_PASS?: string;

  @IsString()
  MAIL_FROM_NAME: string;

  @IsString()
  MAIL_FROM_ADDRESS: string;

  @IsString()
  ADMIN_EMAIL: string;

  @IsString()
  CRISIS_TEAM_EMAIL: string;

  // AI Prompts
  @IsString()
  @IsOptional()
  AI_SYSTEM_PROMPT?: string;

  @IsString()
  @IsOptional()
  AI_SENTIMENT_PROMPT?: string;

  @IsString()
  @IsOptional()
  AI_MODERATION_PROMPT?: string;

  @IsString()
  @IsOptional()
  AI_SUMMARY_PROMPT?: string;

  @IsString()
  @IsOptional()
  AI_RECOMMENDATION_PROMPT?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints || {}).join(', ')}`,
      )
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  if (
    !validatedConfig.DATABASE_URL &&
    (!validatedConfig.DB_HOST || !validatedConfig.DB_NAME)
  ) {
    throw new Error(
      'Either DATABASE_URL or DB_HOST and DB_NAME must be provided',
    );
  }

  return validatedConfig;
}

export default registerAs('env', () => validate(process.env));
