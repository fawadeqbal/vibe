import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';

export const IDEMPOTENT = 'idempotent';

/**
 * Marks a POST as safe to retry: a repeated `Idempotency-Key` from the same
 * user replays the first response instead of running the handler again
 * (a double-tap on "Claim" never pays twice).
 */
export const Idempotent = (opts: { required?: boolean } = {}): MethodDecorator =>
  applyDecorators(
    SetMetadata(IDEMPOTENT, { required: opts.required ?? false }),
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({ name: 'Idempotency-Key', required: opts.required ?? false, description: 'Client-generated unique key (UUID) for safe retries' }),
  );
