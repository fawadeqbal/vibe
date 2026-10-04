import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';

import { AuditService } from './audit.service';
import type { StaffPrincipal } from './staff.types';

export interface AuditOptions {
  /** e.g. "user.ban" — `<thing>.<verb>`, used for filtering. */
  action: string;
  /** Target type, e.g. "user". */
  target?: string;
  /** Route param holding the target id (default "id"). */
  param?: string;
  /** One readable line for the log, from the request and the handler result. */
  summary?: (ctx: { body: Record<string, unknown>; params: Record<string, string>; result: unknown }) => string;
  /** Don't store the request body (e.g. it is large or only ids). */
  omitBody?: boolean;
}

/**
 * Attached by `@StaffApi`. For handlers marked `@Audit(...)`, records who
 * did what to which target once the handler has succeeded.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<AuditOptions | undefined>('audit', ctx.getHandler());
    if (!opts) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { staff?: StaffPrincipal }>();
    return next.handle().pipe(
      tap((result) => {
        const staff = req.staff;
        if (!staff) return;
        const params = (req.params ?? {}) as Record<string, string>;
        const body = (req.body ?? {}) as Record<string, unknown>;
        void this.audit.record({
          actor: staff,
          action: opts.action,
          targetType: opts.target,
          targetId: params[opts.param ?? 'id'],
          summary: opts.summary?.({ body, params, result }),
          data: opts.omitBody ? undefined : Object.keys(body).length ? body : undefined,
          req,
        });
      }),
    );
  }
}
