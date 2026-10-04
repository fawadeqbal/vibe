import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { resolve } from 'node:path';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { RedisIoAdapter } from './infra/realtime/redis-io.adapter';

export async function configureApp(app: NestExpressApplication): Promise<void> {
  const config = app.get(AppConfig);
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  const origins = config.list('CORS_ORIGINS');
  app.enableCors({ origin: origins.includes('*') ? (origin, cb) => cb(null, true) : origins, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  // Local uploads (the S3 driver serves from its own CDN instead).
  app.useStaticAssets(resolve(config.get('UPLOAD_DIR')), { prefix: '/media', index: false, maxAge: '7d' });
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));

  const io = new RedisIoAdapter(app);
  io.connectToRedis();
  app.useWebSocketAdapter(io);

  if (config.get('SWAGGER_ENABLED')) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Vibe API')
        .setDescription('REST for accounts, wallet, payments, social and safety; Socket.IO for matching and live events. Errors: `{ error: { code, message, details } }`.')
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/openapi.json' });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  await configureApp(app);
  const port = app.get(AppConfig).get('PORT');
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`Vibe API on :${port} — docs at /docs`);
}

if (require.main === module) void bootstrap();
