import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';

import { PreferencesService } from './preferences.service';
import { PreferencesController } from './preferences.controller';
import { UserPreferences } from '../database/entities/user-preferences.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([UserPreferences]),
    ConfigModule,
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
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
  ],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
