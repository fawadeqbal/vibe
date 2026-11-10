import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { endedSessionKey } from '../../common/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../../common/types/auth-user';
import { Clock, MS } from '../../common/utils/clock';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { deviceLabel } from './device-label';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
  /** android | ios | web (see clientKind). */
  client?: string;
  /** The app's own name for the phone (X-Device), e.g. "Samsung SM-A515F · Android 13". */
  device?: string;
}

/**
 * Short-lived JWT access tokens + opaque, rotating refresh tokens. Each
 * refresh replaces the token; presenting an already-rotated token means it
 * leaked, so every session in that family is revoked.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly redis: RedisService,
  ) {}

  async issue(user: Pick<User, 'id' | 'role'>, client: ClientInfo, family = randomToken(12)): Promise<TokenPair> {
    const refreshToken = randomToken(32);
    const refreshExpires = this.clock.plus(this.config.get('REFRESH_TTL_DAYS') * MS.day);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshHash: sha256(refreshToken),
        family,
        expiresAt: refreshExpires,
        userAgent: client.userAgent?.slice(0, 200),
        ip: client.ip,
        client: client.client?.slice(0, 16),
        device: deviceLabel(client),
      },
    });
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, sid: session.id, fam: family };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttl });
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: this.clock.plus(ttl * MS.second).toISOString(),
      refreshExpiresAt: refreshExpires.toISOString(),
    };
  }

  async rotate(refreshToken: string, client: ClientInfo): Promise<{ tokens: TokenPair; userId: string }> {
    const session = await this.prisma.session.findUnique({ where: { refreshHash: sha256(refreshToken) }, include: { user: true } });
    if (!session) throw AppError.unauthenticated('Invalid session');
    if (session.revokedAt) {
      // Signed out (here, from another device, by the team): just over. An old refresh token used again: it leaked.
      if (session.revokeReason && session.revokeReason !== 'rotated') throw AppError.unauthenticated('Signed out on this device', ErrorCode.SESSION_ENDED);
      this.logger.warn(`Refresh token reuse for user ${session.userId}; revoking family`);
      await this.prisma.session.updateMany({ where: { family: session.family, revokedAt: null }, data: { revokedAt: this.clock.now(), revokeReason: 'reuse' } });
      throw AppError.unauthenticated('Session revoked');
    }
    if (session.expiresAt < this.clock.now() || session.user.status !== 'ACTIVE') throw AppError.unauthenticated('Session expired');
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: this.clock.now(), revokeReason: 'rotated' } });
    // The app may have been updated (new X-Device) since: the next row carries what it says now.
    client = { ...client, device: client.device ?? session.device ?? undefined, client: client.client ?? session.client ?? undefined };
    return { tokens: await this.issue(session.user, client, session.family), userId: session.userId };
  }

  /** Log out on this device. */
  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { refreshHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: this.clock.now(), revokeReason: 'signed_out' } });
  }

  /** Every device (ban, account deleted): their access tokens stop working at once too. */
  async revokeAll(userId: string): Promise<void> {
    const live = await this.prisma.session.findMany({ where: { userId, revokedAt: null }, select: { family: true } });
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: this.clock.now(), revokeReason: 'all' } });
    await this.markEnded([...new Set(live.map((s) => s.family))]);
  }

  /** Access tokens of these sign-ins stop working now (they'd otherwise last up to their 15 minutes). */
  async markEnded(families: string[]): Promise<void> {
    if (!families.length) return;
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS') + 60;
    const m = this.redis.client.multi();
    for (const f of families) m.set(endedSessionKey(f), '1', 'EX', ttl);
    await m.exec();
  }
}
