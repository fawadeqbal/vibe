import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, of, switchMap, tap } from 'rxjs';

import { RedisService } from '../../infra/redis/redis.service';
import { IDEMPOTENT } from '../decorators/idempotent.decorator';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

const TTL_SECONDS = 24 * 60 * 60;
const IN_FLIGHT = '__in_flight__';

/**
 * Replays the stored response for a repeated `Idempotency-Key` (per user and
 * route). A concurrent duplicate gets 409 instead of running twice.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ required: boolean }>(IDEMPOTENT, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) {
      if (meta?.required) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
      return next.handle();
    }
    if (key.length > 100) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key is too long');
    const redisKey = `idem:${req.user?.id ?? 'anon'}:${req.method}:${req.route?.path ?? req.url}:${key}`;

    return from(this.redis.client.set(redisKey, IN_FLIGHT, 'EX', TTL_SECONDS, 'NX')).pipe(
      switchMap((claimed) => {
        if (claimed) {
          return next.handle().pipe(
            tap({
              next: (body) => void this.redis.setJson(redisKey, { body }, TTL_SECONDS),
              error: () => void this.redis.client.del(redisKey),
            }),
          );
        }
        return from(this.redis.client.get(redisKey)).pipe(
          switchMap((raw) => {
            if (!raw || raw === IN_FLIGHT) throw AppError.conflict('The same request is still being processed');
            return of((JSON.parse(raw) as { body: unknown }).body);
          }),
        );
      }),
    );
  }
}
