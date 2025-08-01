// apps/user-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';

import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { CounselorsModule } from './counselors/counselors.module';
import { AuthModule } from './auth/auth.module';

import { User } from './database/entities/user.entity';
import { CounselorProfile } from './database/entities/counselor-profile.entity';
import { UserSession } from './database/entities/user-session.entity';
import { OAuthProvider } from './database/entities/oauth-provider.entity';

import {
  PrometheusController,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Prometheus metrics
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: { prefix: 'user_service_' },
      },
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          name: 'short',
          ttl: 1000,
          limit: 10,
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: 50,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 100,
        },
      ],
      inject: [ConfigService],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [User, CounselorProfile, UserSession, OAuthProvider],
        synchronize: false, // Use migrations in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),

    // Health checks
    HealthModule,

    // Application modules
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    CounselorsModule,
  ],
  controllers: [PrometheusController],
  providers: [],
})
export class AppModule {}
