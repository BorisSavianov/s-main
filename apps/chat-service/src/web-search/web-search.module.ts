// apps/chat-service/src/web-search/web-search.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { WebSearchService } from './web-search.service';
import { WebSearchController } from './web-search.controller';
import { AuthCoreModule } from '../../../auth-service/src/auth/auth-core.module';

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
    ConfigModule,
  ],
  controllers: [WebSearchController],
  providers: [WebSearchService],
  exports: [WebSearchService],
})
export class WebSearchModule {}
