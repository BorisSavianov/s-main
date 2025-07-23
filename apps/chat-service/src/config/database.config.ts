// apps/chat-service/src/config/database.config.ts
import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export type DatabaseConfig = TypeOrmModuleOptions & {
  type: 'postgres';
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  synchronize: boolean;
  logging: boolean | string[] | 'all';
  ssl?: boolean | object;
  extra?: {
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    query_timeout?: number;
    statement_timeout?: number;
  };
  migrations?: string[];
  migrationsTableName?: string;
  migrationsRun?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  autoLoadEntities?: boolean;
};

export default registerAs('database', (): DatabaseConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  const config: DatabaseConfig = {
    type: 'postgres',
    // Use autoLoadEntities instead of manually specifying entities array
    autoLoadEntities: true,
    synchronize: isDevelopment && !process.env.DISABLE_SYNC, // Only in development
    logging: isDevelopment ? 'all' : ['error', 'warn'],
    retryAttempts: 3,
    retryDelay: 3000,
  };

  // Database connection configuration
  if (process.env.DATABASE_URL) {
    // Use connection URL (recommended for production)
    config.url = process.env.DATABASE_URL;
  } else {
    // Use individual connection parameters
    config.host = process.env.DB_HOST || 'localhost';
    config.port = parseInt(process.env.DB_PORT || '5432', 10);
    config.username = process.env.DB_USERNAME || 'postgres';
    config.password = process.env.DB_PASSWORD || '';
    config.database = process.env.DB_NAME || 'chat_service';
  }

  // SSL configuration for production
  if (isProduction) {
    config.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      // For AWS RDS, you might want to specify the CA certificate
      ca: process.env.DB_CA_CERT,
      cert: process.env.DB_CLIENT_CERT,
      key: process.env.DB_CLIENT_KEY,
    };
  } else if (process.env.DB_SSL_ENABLED === 'true') {
    // Allow SSL in development if explicitly enabled
    config.ssl = {
      rejectUnauthorized: false,
    };
  }

  // Connection pool settings
  config.extra = {
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(
      process.env.DB_CONNECTION_TIMEOUT || '2000',
      10,
    ),
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '60000', 10),
    statement_timeout: parseInt(
      process.env.DB_STATEMENT_TIMEOUT || '60000',
      10,
    ),
  };

  // Migration settings
  const migrationsPath =
    process.env.DB_MIGRATIONS_PATH || 'src/migrations/**/*{.ts,.js}';
  config.migrations = [join(__dirname, '..', '..', migrationsPath)];
  config.migrationsTableName = process.env.DB_MIGRATIONS_TABLE || 'migrations';
  config.migrationsRun = process.env.DB_RUN_MIGRATIONS === 'true';

  return config;
});

// Type-safe configuration validation
export const validateDatabaseConfig = (
  config: DatabaseConfig,
): DatabaseConfig => {
  const requiredEnvVars: string[] = [];

  if (!config.url && !config.host) {
    requiredEnvVars.push('DATABASE_URL or DB_HOST');
  }

  if (!config.url && !config.database) {
    requiredEnvVars.push('DB_NAME');
  }

  if (!config.url && !config.username) {
    requiredEnvVars.push('DB_USERNAME');
  }

  // Validate port range
  if (config.port && (config.port < 1 || config.port > 65535)) {
    throw new Error('Database port must be between 1 and 65535');
  }

  // Validate pool settings
  if (config.extra?.max && config.extra.max < 1) {
    throw new Error('Database pool max connections must be at least 1');
  }

  if (requiredEnvVars.length > 0) {
    throw new Error(
      `Missing required database configuration: ${requiredEnvVars.join(', ')}`,
    );
  }

  return config;
};

// Database health check utility
export const createDatabaseHealthCheck = () => {
  return {
    name: 'database',
    timeout: 5000,
    check: async (connection: any) => {
      try {
        await connection.query('SELECT 1');
        return {
          status: 'up',
          database: connection.options.database,
          host: connection.options.host,
        };
      } catch (error) {
        return {
          status: 'down',
          message: error.message,
        };
      }
    },
  };
};
