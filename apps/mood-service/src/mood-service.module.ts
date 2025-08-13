// apps/mood-service/src/mood-service.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { MoodEntriesModule } from './mood-entries/mood-entries.module';
import { MoodPatternsModule } from './mood-patterns/mood-patterns.module';
import { MoodGoalsModule } from './mood-goals/mood-goals.module';
import { MoodInsightsModule } from './mood-insights/mood-insights.module';
import { MoodTriggersModule } from './mood-triggers/mood-triggers.module';
import { AuthModule } from './auth.module';
import { HealthModule } from './health/health.module';

import { MoodEntry } from './database/entities/mood-entry.entity';
import { MoodPattern } from './database/entities/mood-pattern.entity';
import { MoodGoal } from './database/entities/mood-goal.entity';
import { MoodInsight } from './database/entities/mood-insight.entity';
import { MoodTrigger } from './database/entities/mood-trigger.entity';

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
        config: { prefix: 'mood_service_' },
      },
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          name: 'short',
          ttl: 1000,
          limit: 20,
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: 100,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 200,
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
        entities: [MoodEntry, MoodPattern, MoodGoal, MoodInsight, MoodTrigger],
        synchronize: false,
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
    MoodEntriesModule,
    MoodPatternsModule,
    MoodGoalsModule,
    MoodInsightsModule,
    MoodTriggersModule,
  ],
  controllers: [PrometheusController],
  providers: [],
})
export class AppModule {}
