// apps/chat-service/src/search/search.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchProcessor } from './processors/search.processor';

// Entities
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { AiContext } from '../ai/entities/ai-context.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatSession, AiContext]),
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        node: configService.get<string>(
          'ELASTICSEARCH_URL',
          'http://elasticsearch:9200',
        ),
        auth: {
          username: configService.get<string>('ELASTICSEARCH_USERNAME') ?? '',
          password: configService.get<string>('ELASTICSEARCH_PASSWORD') ?? '',
        },
        maxRetries: 3,
        requestTimeout: 10000,
        sniffOnStart: false,
      }),

      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'search-indexing',
    }),
  ],
  controllers: [SearchController],
  providers: [SearchService, SearchProcessor],
  exports: [SearchService],
})
export class SearchModule {}
