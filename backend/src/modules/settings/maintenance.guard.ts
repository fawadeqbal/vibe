import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { IS_STAFF } from '../../common/decorators/staff.constants';
import { SettingsService } from './settings.service';

export const SKIP_MAINTENANCE = 'skipMaintenance';

/** Keeps a route working during maintenance (health, app config, webhooks). */
export const SkipMaintenance = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_MAINTENANCE, true);

/** Global: while maintenance mode is on, app routes answer 503 MAINTENANCE. Staff routes are unaffected. */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_STAFF, targets) || this.reflector.getAllAndOverride<boolean>(SKIP_MAINTENANCE, targets)) return true;
    const s = await this.settings.all();
    if (!s['maintenance.enabled']) return true;
    throw new AppError(ErrorCode.MAINTENANCE, s['maintenance.message'], HttpStatus.SERVICE_UNAVAILABLE);
  }
}
