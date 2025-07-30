// src/main.ts
import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // API versioning
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Serenity Space Auth Service')
    .setDescription(
      'Authentication service for mental health platform SerenitySpace',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = process.env.PORT_AUTH || 4000;
  await app.listen(port);
  console.log(`🚀 Auth service running on port ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/docs`);
}

bootstrap();
