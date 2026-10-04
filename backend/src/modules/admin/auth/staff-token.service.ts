import { Injectable, Logger } from '@nestjs/common';
import type { StaffSession } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { Clock, MS } from '../../../common/utils/clock';
import { randomToken, sha256 } from '../../../common/utils/crypto';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { StaffContextService } from '../core/staff-context.service';
import { StaffJwt } from '../core/staff-jwt';
import type { StaffTokenPayload } from '../core/staff.types';

export interface StaffTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface StaffClient {
  userAgent?: string;
  ip?: string;
}

/** A rotated token presented again within this window gets the same new pair (parallel tabs/requests). */
const GRACE_SECONDS = 30;
const ROTATED = (hash: string) => `staff:rotated:${hash}`;

/**
 * Staff sessions: 10-minute access tokens and rotating refresh tokens. A
 * session lives at most STAFF_SESSION_HOURS from sign-in, however often it
 * refreshes. Reusing an old refresh token (outside the grace window) ends
 * every session of that sign-in.
 */
@Injectable()
export class StaffTokenService {
  private readonly logger = new Logger(StaffTokenService.name);

  constructor(
    private readonly jwt: StaffJwt,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly contexts: StaffContextService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  get accessTtl(): number {
    return this.config.get('STAFF_ACCESS_TTL_SECONDS');
  }

  async issue(staffId: string, client: StaffClient, prior?: Pick<StaffSession, 'family' | 'expiresAt'>): Promise<StaffTokens> {
    const refreshToken = randomToken(32);
    const expiresAt = prior?.expiresAt ?? this.clock.plus(this.config.get('STAFF_SESSION_HOURS') * MS.hour);
    const session = await this.prisma.staffSession.create({
      data: { staffId, refreshHash: sha256(refreshToken), family: prior?.family ?? randomToken(12), expiresAt, userAgent: client.userAgent?.slice(0, 200), ip: client.ip },
    });
    const payload: StaffTokenPayload = { sub: staffId, sid: session.id, typ: 'staff' };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.accessTtl });
    const accessExpires = new Date(Math.min(this.clock.plus(this.accessTtl * MS.second).getTime(), expiresAt.getTime()));
    return { accessToken, refreshToken, accessExpiresAt: accessExpires.toISOString(), refreshExpiresAt: expiresAt.toISOString() };
  }

  async rotate(refreshToken: string, client: StaffClient): Promise<{ tokens: StaffTokens; staffId: string }> {
    const hash = sha256(refreshToken);
    const session = await this.prisma.staffSession.findUnique({ where: { refreshHash: hash }, include: { staff: { select: { status: true } } } });
    if (!session) throw AppError.unauthenticated('Invalid session');
    if (session.revokedAt) {
      const replay = await this.redis.getJson<StaffTokens>(ROTATED(hash));
      if (replay) return { tokens: replay, staffId: session.staffId };
      this.logger.warn(`Staff refresh token reuse for ${session.staffId}; ending that sign-in`);
      await this.revokeWhere({ family: session.family });
      throw AppError.unauthenticated('Session revoked');
    }
    if (session.expiresAt <= this.clock.now() || session.staff.status !== 'ACTIVE') throw AppError.unauthenticated('Session expired');
    const claimed = await this.prisma.staffSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    if (claimed.count === 0) {
      // Lost a race with a parallel refresh; wait briefly for its result.
      for (let i = 0; i < 10; i++) {
        const replay = await this.redis.getJson<StaffTokens>(ROTATED(hash));
        if (replay) return { tokens: replay, staffId: session.staffId };
        await new Promise((r) => setTimeout(r, 50));
      }
      throw AppError.unauthenticated('Session revoked');
    }
    const tokens = await this.issue(session.staffId, client, session);
    await this.redis.setJson(ROTATED(hash), tokens, GRACE_SECONDS);
    return { tokens, staffId: session.staffId };
  }

  async revokeToken(refreshToken: string): Promise<void> {
    await this.revokeWhere({ refreshHash: sha256(refreshToken) });
  }

  async revokeSession(staffId: string, sessionId: string): Promise<void> {
    const s = await this.prisma.staffSession.findFirst({ where: { id: sessionId, staffId } });
    if (!s) throw AppError.notFound('Session');
    await this.revokeWhere({ family: s.family });
  }

  /** Ends every session of a person, optionally keeping the current sign-in. */
  async revokeAll(staffId: string, keepSessionId?: string): Promise<void> {
    let keepFamily: string | undefined;
    if (keepSessionId) keepFamily = (await this.prisma.staffSession.findUnique({ where: { id: keepSessionId } }))?.family;
    await this.revokeWhere({ staffId, ...(keepFamily ? { family: { not: keepFamily } } : {}) });
  }

  /** Active sign-ins (one row per family, newest rotation). */
  async list(staffId: string) {
    const rows = await this.prisma.staffSession.findMany({ where: { staffId, revokedAt: null, expiresAt: { gt: this.clock.now() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((s) => ({ id: s.id, userAgent: s.userAgent, ip: s.ip, signedInAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString() }));
  }

  private async revokeWhere(where: { family?: string | { not: string }; refreshHash?: string; staffId?: string }): Promise<void> {
    const sessions = await this.prisma.staffSession.findMany({ where: { ...where, revokedAt: null }, select: { id: true, family: true } });
    if (!sessions.length) return;
    // Also flag every session id of those families, so live access tokens stop now.
    const families = [...new Set(sessions.map((s) => s.family))];
    const all = await this.prisma.staffSession.findMany({ where: { family: { in: families } }, select: { id: true } });
    await this.prisma.staffSession.updateMany({ where: { family: { in: families }, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    await this.contexts.markSessionsRevoked(
      all.map((s) => s.id),
      this.accessTtl,
    );
  }
}
