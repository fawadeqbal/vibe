import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_STAFF } from '../../common/decorators/staff.constants';
import { RegionService } from './region.service';

export const SKIP_REGION = 'skipRegion';

/**
 * Keeps a route open to blocked countries: health checks, provider
 * webhooks and postbacks (their servers can be anywhere), legal pages,
 * e-mail unsubscribe links and landing-page counters.
 */
export const SkipRegion = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_REGION, true);

/**
 * Global: requests from a blocked country (admin → Settings → Region) get
 * 451 REGION_UNAVAILABLE, so they can't sign up, sign in, match or pay.
 * Staff routes are unaffected.
 */
@Injectable()
export class RegionGuard implements CanActivate {
  constructor(
    private readonly region: RegionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_STAFF, targets) || this.reflector.getAllAndOverride<boolean>(SKIP_REGION, targets)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    await this.region.assertOrigin(req.headers, req.socket?.remoteAddress, 'api', req.path);
    return true;
  }
}
