// apps/chat-service/src/ai/ai.module.ts - UPDATED
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AIService } from './ai.service';
import { AIController } from './ai.controler';
import { AiContext } from './entities/ai-context.entity';
import { EnhancedAIService } from './web-ai.service';

// Processors
import { AIProcessor } from './processors/ai.processor';

// Import guards and strategies from auth-service
import { JwtAuthGuard } from '../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth-service/src/auth/guards/roles.guard';
import { JwtStrategy } from '../../../auth-service/src/auth/strategies/jwt.strategy';
import { AuthCoreModule } from 'apps/auth-service/src/auth/auth-core.module';
import { WebSearchModule } from '../web-search/web-search.module';

@Module({
  imports: [
    AuthCoreModule,
    TypeOrmModule.forFeature([AiContext]),

    // HTTP module for AI service communications
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

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

    // Import WebSearchModule to get access to WebScraperService
    forwardRef(() => WebSearchModule),
  ],
  controllers: [AIController],
  providers: [
    AIService,
    EnhancedAIService,
    AIProcessor,

    // Authentication strategy
    JwtStrategy,

    // Guards
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AIService, EnhancedAIService, JwtAuthGuard, RolesGuard],
})
export class AiModule {}
