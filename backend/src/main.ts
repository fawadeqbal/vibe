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
import { serveMedia } from './infra/storage/media.handler';
import { StorageProvider } from './infra/storage/storage.provider';

export async function configureApp(app: NestExpressApplication): Promise<void> {
  const config = app.get(AppConfig);
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  const origins = config.list('CORS_ORIGINS');
  app.enableCors({ origin: origins.includes('*') ? (origin, cb) => cb(null, true) : origins, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  // Public media at /media: streamed from the bucket (s3 driver; a CDN set in S3_PUBLIC_URL can
  // sit in front with this as its origin), then from disk — the local driver's files, or under s3
  // anything uploaded before the switch (same URLs, so old avatars keep working).
  if (config.get('STORAGE_DRIVER') === 's3') app.use('/media', serveMedia(app.get(StorageProvider)));
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
