import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import type { AuthUser } from '../../common/types/auth-user';
import { clientKind } from './client-kind';
import { PlatformsService } from './platforms.service';

/** Every signed-in request marks the person active today on its client (app or web). */
@Injectable()
export class ClientActivityInterceptor implements NestInterceptor {
  constructor(private readonly platforms: PlatformsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
      const id = req.user?.id;
      if (id && !req.path.includes('/admin/')) void this.platforms.noteActive(id, clientKind(req.headers)).catch(() => undefined);
    }
    return next.handle();
  }
}
