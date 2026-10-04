import { INestApplicationContext, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';

import { extractBearer, verifyAccessToken } from '../../common/guards/jwt-auth.guard';
import { AppConfig } from '../../config/app-config.service';
import { RedisService } from '../redis/redis.service';

/**
 * Socket.IO over a Redis pub/sub adapter, so `server.to('user:123')` reaches
 * that user on whichever instance holds their socket. Every connection is
 * authenticated in middleware before any gateway sees it.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const redis = this.app.get(RedisService);
    this.adapterConstructor = createAdapter(redis.create('io-pub'), redis.create('io-sub'));
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.app.get(AppConfig);
    const origins = config.list('CORS_ORIGINS');
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: origins.includes('*') ? true : origins, credentials: true },
      pingInterval: 20000,
      pingTimeout: 20000,
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);

    const jwt = this.app.get(JwtService);
    server.use((socket, next) => {
      const token = (socket.handshake.auth?.token as string | undefined) ?? extractBearer(socket.handshake.headers.authorization);
      if (!token) return next(new Error('UNAUTHENTICATED'));
      verifyAccessToken(jwt, token)
        .then((user) => {
          socket.data.user = user;
          next();
        })
        .catch((e) => next(new Error(e?.code ?? 'UNAUTHENTICATED')));
    });
    this.log.log("Socket.IO ready (redis adapter)");
    return server;
  }
}
