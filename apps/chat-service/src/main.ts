// apps/chat-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './chat-service.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('ChatService');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:4000',
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // API versioning
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Mental Health Chat Service API')
    .setDescription('AI-powered chat service for mental health support')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('search', 'Semantic search functionality')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'chat-service',
      version: '1.0.0',
    });
  });

  const port = process.env.PORT || 4002;
  await app.listen(port);

  logger.log(`🚀 Chat service running on port ${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
