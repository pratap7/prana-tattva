import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getEnvConfig } from './config/env.config';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

async function bootstrap() {
  const env = getEnvConfig();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Attach structured Pino logger
  const pinoLogger = app.get(Logger);
  app.useLogger(pinoLogger);

  // Global filters and pipes
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe());

  // Enable CORS
  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  });

  // Swagger OpenAPI documentation setup at /docs
  const config = new DocumentBuilder()
    .setTitle('Project Nirvana API')
    .setDescription(
      'Holistic Wellness Platform API: Yoga, Reiki, Psychotherapy, Pranic Healing, Astrology & Sound Healing',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Project Nirvana API Documentation',
  });

  await app.listen(env.PORT, '0.0.0.0');
  pinoLogger.log(`🧘 Nirvana API running on http://localhost:${env.PORT}`);
  pinoLogger.log(`📜 OpenAPI documentation available at http://localhost:${env.PORT}/docs`);
  pinoLogger.log(`🩺 Health endpoint at http://localhost:${env.PORT}/health`);
}

bootstrap().catch((err) => {
  console.error('Fatal API bootstrap error:', err);
  process.exit(1);
});
