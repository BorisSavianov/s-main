// apps/chat-service/src/websocket/websocket.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { ConnectionManager } from './connection.manager';

// Guards and Middleware
import { WsAuthGuard } from './guards/ws-auth.guard';
import { WsThrottleGuard } from './guards/ws-throttle.guard';

// Entities
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, ChatMessage]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    WebSocketGateway,
    WebSocketService,
    ConnectionManager,
    WsAuthGuard,
    WsThrottleGuard,
  ],
  exports: [WebSocketService, ConnectionManager],
})
export class WebSocketModule {}
