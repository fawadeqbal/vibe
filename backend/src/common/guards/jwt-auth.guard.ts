import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';

import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { IS_STAFF } from '../decorators/staff.constants';
import type { AccessTokenPayload, AuthUser } from '../types/auth-user';

/** Global guard: every HTTP route needs a valid access token unless `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true; // sockets authenticate at handshake
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_STAFF, targets)) return true; // StaffAuthGuard's job
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ctx.switchToHttp().getRequest();
    const token = extractBearer(req.headers?.authorization);
    if (!token) {
      if (isPublic) return true;
      throw AppError.unauthenticated();
    }
    try {
      req.user = await verifyAccessToken(this.jwt, token);
    } catch (e) {
      if (isPublic) return true;
      throw e;
    }
    return true;
  }
}

export function extractBearer(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function verifyAccessToken(jwt: JwtService, token: string): Promise<AuthUser> {
  try {
    const p = await jwt.verifyAsync<AccessTokenPayload>(token);
    return { id: p.sub, role: p.role, sessionId: p.sid };
  } catch (e) {
    if (e instanceof TokenExpiredError) throw AppError.unauthenticated('Session expired', ErrorCode.TOKEN_EXPIRED);
    throw AppError.unauthenticated('Invalid token');
  }
}
