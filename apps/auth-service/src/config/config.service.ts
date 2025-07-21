// src/config/config.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import * as Joi from 'joi';

export interface DatabaseConfig {
  url: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  logging: boolean;
  synchronize: boolean;
  maxConnections: number;
  connectionTimeout: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  retryAttempts: number;
  retryDelay: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
  keepAlive: number;
  connectTimeout: number;
  commandTimeout: number;
}

export interface JwtConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
  algorithm: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  replyTo?: string;
  templates: {
    baseUrl: string;
    assetsUrl: string;
  };
}

export interface SecurityConfig {
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  refreshTokenTimeout: number;
  passwordResetTimeout: number;
  emailVerificationTimeout: number;
  corsOrigins: string[];
  trustedProxies: string[];
  rateLimits: {
    login: { ttl: number; limit: number };
    register: { ttl: number; limit: number };
    forgotPassword: { ttl: number; limit: number };
    resetPassword: { ttl: number; limit: number };
    verifyEmail: { ttl: number; limit: number };
  };
}

export interface OAuthConfig {
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope: string[];
  };
  facebook: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope: string[];
  };
}

export interface AppConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  port: number;
  baseUrl: string;
  frontendUrl: string;
  apiVersion: string;
  globalPrefix: string;
  swagger: {
    enabled: boolean;
    title: string;
    description: string;
    version: string;
    path: string;
  };
  monitoring: {
    enabled: boolean;
    metricsPath: string;
    healthPath: string;
  };
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  format: 'json' | 'simple';
  prettyPrint: boolean;
  timestamp: boolean;
  colorize: boolean;
  maxFiles: number;
  maxSize: string;
  datePattern: string;
  filename: string;
  errorFilename: string;
  combinedFilename: string;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
  skipIf?: (context: any) => boolean;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: NestConfigService) {}

  // Environment
  get isDevelopment(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'development';
  }

  get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  get isTest(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'test';
  }

  // App Configuration
  get app(): AppConfig {
    return {
      name: this.configService.get<string>(
        'APP_NAME',
        'Mental Health Auth Service',
      ),
      version: this.configService.get<string>('APP_VERSION', '1.0.0'),
      environment: this.configService.get<
        'development' | 'production' | 'test'
      >('NODE_ENV', 'development'),
      port: this.configService.get<number>('PORT', 3000),
      baseUrl: this.configService.get<string>(
        'BASE_URL',
        'http://localhost:3000',
      ),
      frontendUrl: this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3001',
      ),
      apiVersion: this.configService.get<string>('API_VERSION', 'v1'),
      globalPrefix: this.configService.get<string>('GLOBAL_PREFIX', 'api'),
      swagger: {
        enabled: this.configService.get<boolean>(
          'SWAGGER_ENABLED',
          !this.isProduction,
        ),
        title: this.configService.get<string>(
          'SWAGGER_TITLE',
          'Mental Health Auth API',
        ),
        description: this.configService.get<string>(
          'SWAGGER_DESCRIPTION',
          'Authentication and authorization service for mental health platform',
        ),
        version: this.configService.get<string>('SWAGGER_VERSION', '1.0.0'),
        path: this.configService.get<string>('SWAGGER_PATH', 'docs'),
      },
      monitoring: {
        enabled: this.configService.get<boolean>('MONITORING_ENABLED', true),
        metricsPath: this.configService.get<string>('METRICS_PATH', '/metrics'),
        healthPath: this.configService.get<string>('HEALTH_PATH', '/health'),
      },
    };
  }

  // Database Configuration
  get database(): DatabaseConfig {
    return {
      url: this.configService.get<string>('DATABASE_URL', ''),
      host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
      port: this.configService.get<number>('DATABASE_PORT', 5432),
      username: this.configService.get<string>('DATABASE_USERNAME', 'postgres'),
      password: this.configService.get<string>('DATABASE_PASSWORD', ''),
      database: this.configService.get<string>(
        'DATABASE_NAME',
        'mental_health_auth',
      ),
      ssl: this.configService.get<boolean>('DATABASE_SSL', this.isProduction),
      logging: this.configService.get<boolean>(
        'DATABASE_LOGGING',
        this.isDevelopment,
      ),
      synchronize: this.configService.get<boolean>(
        'DATABASE_SYNCHRONIZE',
        this.isDevelopment,
      ),
      maxConnections: this.configService.get<number>(
        'DATABASE_MAX_CONNECTIONS',
        10,
      ),
      connectionTimeout: this.configService.get<number>(
        'DATABASE_CONNECTION_TIMEOUT',
        30000,
      ),
    };
  }

  // Redis Configuration
  get redis(): RedisConfig {
    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      retryAttempts: this.configService.get<number>('REDIS_RETRY_ATTEMPTS', 3),
      retryDelay: this.configService.get<number>('REDIS_RETRY_DELAY', 1000),
      maxRetriesPerRequest: this.configService.get<number>(
        'REDIS_MAX_RETRIES_PER_REQUEST',
        3,
      ),
      lazyConnect: this.configService.get<boolean>('REDIS_LAZY_CONNECT', true),
      keepAlive: this.configService.get<number>('REDIS_KEEP_ALIVE', 30000),
      connectTimeout: this.configService.get<number>(
        'REDIS_CONNECT_TIMEOUT',
        10000,
      ),
      commandTimeout: this.configService.get<number>(
        'REDIS_COMMAND_TIMEOUT',
        5000,
      ),
    };
  }

  // JWT Configuration
  get jwt(): JwtConfig {
    return {
      secret: this.configService.get<string>(
        'JWT_SECRET',
        'your-super-secret-jwt-key',
      ),
      refreshSecret: this.configService.get<string>(
        'JWT_REFRESH_SECRET',
        'your-super-secret-refresh-key',
      ),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      refreshExpiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '7d',
      ),
      issuer: this.configService.get<string>(
        'JWT_ISSUER',
        'mental-health-auth',
      ),
      audience: this.configService.get<string>(
        'JWT_AUDIENCE',
        'mental-health-platform',
      ),
      algorithm: this.configService.get<string>('JWT_ALGORITHM', 'HS256'),
    };
  }

  // Email Configuration
  get email(): EmailConfig {
    return {
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      user: this.configService.get<string>('SMTP_USER', ''),
      password: this.configService.get<string>('SMTP_PASSWORD', ''),
      from: this.configService.get<string>(
        'SMTP_FROM',
        'noreply@mentalhealth.com',
      ),
      replyTo: this.configService.get<string>('SMTP_REPLY_TO'),
      templates: {
        baseUrl: this.configService.get<string>(
          'EMAIL_TEMPLATE_BASE_URL',
          this.app.frontendUrl,
        ),
        assetsUrl: this.configService.get<string>(
          'EMAIL_ASSETS_URL',
          `${this.app.frontendUrl}/assets`,
        ),
      },
    };
  }

  // Security Configuration
  get security(): SecurityConfig {
    return {
      bcryptRounds: this.configService.get<number>('BCRYPT_ROUNDS', 12),
      maxLoginAttempts: this.configService.get<number>('MAX_LOGIN_ATTEMPTS', 5),
      lockoutDuration: this.configService.get<number>('LOCKOUT_DURATION', 900), // 15 minutes
      sessionTimeout: this.configService.get<number>('SESSION_TIMEOUT', 86400), // 24 hours
      refreshTokenTimeout: this.configService.get<number>(
        'REFRESH_TOKEN_TIMEOUT',
        604800,
      ), // 7 days
      passwordResetTimeout: this.configService.get<number>(
        'PASSWORD_RESET_TIMEOUT',
        3600,
      ), // 1 hour
      emailVerificationTimeout: this.configService.get<number>(
        'EMAIL_VERIFICATION_TIMEOUT',
        86400,
      ), // 24 hours
      corsOrigins: this.configService
        .get<string>('CORS_ORIGINS', this.app.frontendUrl)
        .split(','),
      trustedProxies: this.configService
        .get<string>('TRUSTED_PROXIES', '127.0.0.1')
        .split(','),
      rateLimits: {
        login: {
          ttl: this.configService.get<number>('RATE_LIMIT_LOGIN_TTL', 60000), // 1 minute
          limit: this.configService.get<number>('RATE_LIMIT_LOGIN_LIMIT', 5),
        },
        register: {
          ttl: this.configService.get<number>(
            'RATE_LIMIT_REGISTER_TTL',
            3600000,
          ), // 1 hour
          limit: this.configService.get<number>('RATE_LIMIT_REGISTER_LIMIT', 3),
        },
        forgotPassword: {
          ttl: this.configService.get<number>(
            'RATE_LIMIT_FORGOT_PASSWORD_TTL',
            3600000,
          ), // 1 hour
          limit: this.configService.get<number>(
            'RATE_LIMIT_FORGOT_PASSWORD_LIMIT',
            3,
          ),
        },
        resetPassword: {
          ttl: this.configService.get<number>(
            'RATE_LIMIT_RESET_PASSWORD_TTL',
            3600000,
          ), // 1 hour
          limit: this.configService.get<number>(
            'RATE_LIMIT_RESET_PASSWORD_LIMIT',
            5,
          ),
        },
        verifyEmail: {
          ttl: this.configService.get<number>(
            'RATE_LIMIT_VERIFY_EMAIL_TTL',
            3600000,
          ), // 1 hour
          limit: this.configService.get<number>(
            'RATE_LIMIT_VERIFY_EMAIL_LIMIT',
            5,
          ),
        },
      },
    };
  }

  // OAuth Configuration
  get oauth(): OAuthConfig {
    return {
      google: {
        clientId: this.configService.get<string>('GOOGLE_CLIENT_ID', ''),
        clientSecret: this.configService.get<string>(
          'GOOGLE_CLIENT_SECRET',
          '',
        ),
        callbackUrl: this.configService.get<string>(
          'GOOGLE_CALLBACK_URL',
          `${this.app.baseUrl}/auth/google/callback`,
        ),
        scope: this.configService
          .get<string>('GOOGLE_SCOPE', 'email,profile')
          .split(','),
      },
      facebook: {
        clientId: this.configService.get<string>('FACEBOOK_CLIENT_ID', ''),
        clientSecret: this.configService.get<string>(
          'FACEBOOK_CLIENT_SECRET',
          '',
        ),
        callbackUrl: this.configService.get<string>(
          'FACEBOOK_CALLBACK_URL',
          `${this.app.baseUrl}/auth/facebook/callback`,
        ),
        scope: this.configService
          .get<string>('FACEBOOK_SCOPE', 'email,public_profile')
          .split(','),
      },
    };
  }

  // Logging Configuration
  get logging(): LoggingConfig {
    return {
      level: this.configService.get<
        'error' | 'warn' | 'info' | 'debug' | 'verbose'
      >('LOG_LEVEL', this.isDevelopment ? 'debug' : 'info'),
      format: this.configService.get<'json' | 'simple'>(
        'LOG_FORMAT',
        this.isProduction ? 'json' : 'simple',
      ),
      prettyPrint: this.configService.get<boolean>(
        'LOG_PRETTY_PRINT',
        this.isDevelopment,
      ),
      timestamp: this.configService.get<boolean>('LOG_TIMESTAMP', true),
      colorize: this.configService.get<boolean>(
        'LOG_COLORIZE',
        this.isDevelopment,
      ),
      maxFiles: this.configService.get<number>('LOG_MAX_FILES', 5),
      maxSize: this.configService.get<string>('LOG_MAX_SIZE', '10m'),
      datePattern: this.configService.get<string>(
        'LOG_DATE_PATTERN',
        'YYYY-MM-DD',
      ),
      filename: this.configService.get<string>(
        'LOG_FILENAME',
        'logs/app-%DATE%.log',
      ),
      errorFilename: this.configService.get<string>(
        'LOG_ERROR_FILENAME',
        'logs/error-%DATE%.log',
      ),
      combinedFilename: this.configService.get<string>(
        'LOG_COMBINED_FILENAME',
        'logs/combined-%DATE%.log',
      ),
    };
  }

  // Throttle Configuration
  get throttle(): Record<string, ThrottleConfig> {
    return {
      default: {
        ttl: this.configService.get<number>('THROTTLE_TTL', 60000), // 1 minute
        limit: this.configService.get<number>('THROTTLE_LIMIT', 100),
        skipSuccessfulRequests: this.configService.get<boolean>(
          'THROTTLE_SKIP_SUCCESSFUL',
          false,
        ),
        skipFailedRequests: this.configService.get<boolean>(
          'THROTTLE_SKIP_FAILED',
          false,
        ),
      },
      auth: {
        ttl: this.security.rateLimits.login.ttl,
        limit: this.security.rateLimits.login.limit,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
      register: {
        ttl: this.security.rateLimits.register.ttl,
        limit: this.security.rateLimits.register.limit,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
    };
  }

  // Utility methods
  get<T>(key: string, defaultValue?: T): T {
    if (defaultValue !== undefined) {
      return this.configService.get<T>(key, defaultValue as T);
    }
    return this.configService.get<T>(key)!;
  }

  getOrThrow<T>(key: string): T {
    return this.configService.getOrThrow<T>(key);
  }

  // Configuration validation
  static getValidationSchema(): Joi.ObjectSchema {
    return Joi.object({
      // App
      NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
      PORT: Joi.number().port().default(3000),
      APP_NAME: Joi.string().default('Mental Health Auth Service'),
      BASE_URL: Joi.string().uri().default('http://localhost:3000'),
      FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),

      // Database
      DATABASE_URL: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
      DATABASE_HOST: Joi.string().default('localhost'),
      DATABASE_PORT: Joi.number().port().default(5432),
      DATABASE_USERNAME: Joi.string().default('postgres'),
      DATABASE_PASSWORD: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
      DATABASE_NAME: Joi.string().default('mental_health_auth'),
      DATABASE_SSL: Joi.boolean().default(false),
      DATABASE_LOGGING: Joi.boolean().default(false),
      DATABASE_SYNCHRONIZE: Joi.boolean().default(false),
      DATABASE_MAX_CONNECTIONS: Joi.number().positive().default(10),

      // Redis
      REDIS_HOST: Joi.string().default('localhost'),
      REDIS_PORT: Joi.number().port().default(6379),
      REDIS_PASSWORD: Joi.string().optional(),
      REDIS_DB: Joi.number().min(0).default(0),

      // JWT
      JWT_SECRET: Joi.string()
        .min(32)
        .when('NODE_ENV', {
          is: 'production',
          then: Joi.required(),
          otherwise: Joi.string().default('your-super-secret-jwt-key'),
        }),
      JWT_REFRESH_SECRET: Joi.string()
        .min(32)
        .when('NODE_ENV', {
          is: 'production',
          then: Joi.required(),
          otherwise: Joi.string().default('your-super-secret-refresh-key'),
        }),
      JWT_EXPIRES_IN: Joi.string().default('15m'),
      JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
      JWT_ISSUER: Joi.string().default('mental-health-auth'),
      JWT_AUDIENCE: Joi.string().default('mental-health-platform'),

      // Email
      SMTP_HOST: Joi.string().default('smtp.gmail.com'),
      SMTP_PORT: Joi.number().port().default(587),
      SMTP_SECURE: Joi.boolean().default(false),
      SMTP_USER: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
      SMTP_PASSWORD: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
      SMTP_FROM: Joi.string().email().default('noreply@mentalhealth.com'),

      // OAuth
      GOOGLE_CLIENT_ID: Joi.string().optional(),
      GOOGLE_CLIENT_SECRET: Joi.string().optional(),
      FACEBOOK_CLIENT_ID: Joi.string().optional(),
      FACEBOOK_CLIENT_SECRET: Joi.string().optional(),

      // Security
      BCRYPT_ROUNDS: Joi.number().min(10).max(15).default(12),
      MAX_LOGIN_ATTEMPTS: Joi.number().positive().default(5),
      LOCKOUT_DURATION: Joi.number().positive().default(900),
      SESSION_TIMEOUT: Joi.number().positive().default(86400),
      REFRESH_TOKEN_TIMEOUT: Joi.number().positive().default(604800),
      PASSWORD_RESET_TIMEOUT: Joi.number().positive().default(3600),
      EMAIL_VERIFICATION_TIMEOUT: Joi.number().positive().default(86400),

      // CORS
      CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
      TRUSTED_PROXIES: Joi.string().default('127.0.0.1'),

      // Rate Limiting
      RATE_LIMIT_LOGIN_TTL: Joi.number().positive().default(60000),
      RATE_LIMIT_LOGIN_LIMIT: Joi.number().positive().default(5),
      RATE_LIMIT_REGISTER_TTL: Joi.number().positive().default(3600000),
      RATE_LIMIT_REGISTER_LIMIT: Joi.number().positive().default(3),
      RATE_LIMIT_FORGOT_PASSWORD_TTL: Joi.number().positive().default(3600000),
      RATE_LIMIT_FORGOT_PASSWORD_LIMIT: Joi.number().positive().default(3),

      // Logging
      LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'debug', 'verbose')
        .default('info'),
      LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
      LOG_PRETTY_PRINT: Joi.boolean().default(false),
      LOG_TIMESTAMP: Joi.boolean().default(true),
      LOG_COLORIZE: Joi.boolean().default(false),

      // Swagger
      SWAGGER_ENABLED: Joi.boolean().default(true),
      SWAGGER_PATH: Joi.string().default('docs'),

      // Monitoring
      MONITORING_ENABLED: Joi.boolean().default(true),
      METRICS_PATH: Joi.string().default('/metrics'),
      HEALTH_PATH: Joi.string().default('/health'),

      // Throttling
      THROTTLE_TTL: Joi.number().positive().default(60000),
      THROTTLE_LIMIT: Joi.number().positive().default(100),
    });
  }
}

// Configuration factory function
export const configFactory = () => ({
  app: {
    name: process.env.APP_NAME || 'Mental Health Auth Service',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
    apiVersion: process.env.API_VERSION || 'v1',
    globalPrefix: process.env.GLOBAL_PREFIX || 'api',
  },
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'mental_health_auth',
    ssl: process.env.DATABASE_SSL === 'true',
    logging: process.env.DATABASE_LOGGING === 'true',
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '10', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'mental-health-auth',
    audience: process.env.JWT_AUDIENCE || 'mental-health-platform',
  },
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'noreply@mentalhealth.com',
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackUrl: process.env.FACEBOOK_CALLBACK_URL,
    },
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900', 10),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400', 10),
    refreshTokenTimeout: parseInt(
      process.env.REFRESH_TOKEN_TIMEOUT || '604800',
      10,
    ),
    passwordResetTimeout: parseInt(
      process.env.PASSWORD_RESET_TIMEOUT || '3600',
      10,
    ),
    emailVerificationTimeout: parseInt(
      process.env.EMAIL_VERIFICATION_TIMEOUT || '86400',
      10,
    ),
  },
});
