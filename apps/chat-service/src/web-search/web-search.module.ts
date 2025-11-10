// apps/chat-service/src/web-search/web-search.module.ts - UPDATED
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { WebSearchService } from './web-search.service';
import { WebSearchController } from './web-search.controller';
import { WebScraperService } from './web-scraper.service';
import { ScraperAIIntegrationService } from './scraper-ai-integration.service';
import { AuthCoreModule } from '../../../auth-service/src/auth/auth-core.module';
import { EnhancedAIService } from '../ai/web-ai.service';
import { AIService } from '../ai/ai.service';
import { BullModule } from '@nestjs/bull';
import { AiModule } from '../ai/ai.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiContext } from '../ai/entities/ai-context.entity';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { WebScraperController } from './web-scraper.controller';

@Module({
  imports: [
    AuthCoreModule,
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'web-search',
        ttl: 60000, // 1 minute
        limit: 20, // 20 searches per minute
      },
    ]),
    AuthCoreModule,
    TypeOrmModule.forFeature([AiContext]),

    // Bull queue for AI processing
    BullModule.registerQueue({
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
    }),
    BullModule.registerQueue({
      name: 'chat-processing',
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
    ConfigModule,
  ],
  controllers: [WebSearchController, WebScraperController],
  providers: [
    WebSearchService,
    WebScraperService,
    ScraperAIIntegrationService,
    EnhancedAIService,
    AIService,
  ],
  exports: [WebSearchService, WebScraperService, ScraperAIIntegrationService],
})
export class WebSearchModule {}
