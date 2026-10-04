import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { StaffStatus } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { extractBearer } from '../../../common/guards/jwt-auth.guard';
import { SettingsService } from '../../settings/settings.service';
import type { Permission } from './permissions';
import { ALLOW_INCOMPLETE_SETUP, IS_STAFF, STAFF_PERMISSIONS, STAFF_PUBLIC } from './staff-api.decorator';
import { StaffContextService } from './staff-context.service';
import { StaffJwt } from './staff-jwt';
import type { StaffPrincipal, StaffTokenPayload } from './staff.types';

/**
 * Global guard for `@StaffApi` controllers (no-op elsewhere):
 * 1. a valid staff token whose session hasn't been revoked,
 * 2. an active staff account,
 * 3. 2FA set up / password changed when required,
 * 4. every permission the endpoint declares.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: StaffJwt,
    private readonly contexts: StaffContextService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (!this.reflector.getAllAndOverride<boolean>(IS_STAFF, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(STAFF_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = extractBearer(req.headers?.authorization);
    if (!token) throw AppError.unauthenticated();
    let payload: StaffTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<StaffTokenPayload>(token);
    } catch (e) {
      if (e instanceof TokenExpiredError) throw AppError.unauthenticated('Session expired', ErrorCode.TOKEN_EXPIRED);
      throw AppError.unauthenticated('Invalid token');
    }
    if (payload.typ !== 'staff') throw AppError.unauthenticated('Invalid token');

    const [staff, revoked] = await Promise.all([this.contexts.get(payload.sub), this.contexts.isSessionRevoked(payload.sid)]);
    if (!staff || staff.status !== StaffStatus.ACTIVE || revoked) throw AppError.unauthenticated('Session ended');
    const principal: StaffPrincipal = { ...staff, sessionId: payload.sid };
    req.staff = principal;

    if (!this.reflector.getAllAndOverride<boolean>(ALLOW_INCOMPLETE_SETUP, targets)) {
      if (staff.mustChangePassword) throw new AppError(ErrorCode.PASSWORD_CHANGE_REQUIRED, 'Choose a new password to continue', HttpStatus.FORBIDDEN);
      if (!staff.twoFactorEnabled && (await this.settings.get('security.require2fa'))) {
        throw new AppError(ErrorCode.TWO_FACTOR_SETUP_REQUIRED, 'Set up two-factor authentication to continue', HttpStatus.FORBIDDEN);
      }
    }

    const needed = this.reflector.getAllAndOverride<Permission[] | undefined>(STAFF_PERMISSIONS, targets) ?? [];
    const missing = needed.filter((p) => !staff.permissions.includes(p));
    if (missing.length) throw new AppError(ErrorCode.FORBIDDEN, "Your role doesn't allow this", HttpStatus.FORBIDDEN, { missing });
    return true;
  }
}
