import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import type { AccessTokenPayload } from '../../common/types/auth-user';
import { Clock, MS } from '../../common/utils/clock';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
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
  ) {}

  async issue(user: Pick<User, 'id' | 'role'>, client: ClientInfo, family = randomToken(12)): Promise<TokenPair> {
    const refreshToken = randomToken(32);
    const refreshExpires = this.clock.plus(this.config.get('REFRESH_TTL_DAYS') * MS.day);
    const session = await this.prisma.session.create({
      data: { userId: user.id, refreshHash: sha256(refreshToken), family, expiresAt: refreshExpires, userAgent: client.userAgent?.slice(0, 200), ip: client.ip },
    });
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, sid: session.id };
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
      this.logger.warn(`Refresh token reuse for user ${session.userId}; revoking family`);
      await this.prisma.session.updateMany({ where: { family: session.family, revokedAt: null }, data: { revokedAt: this.clock.now() } });
      throw AppError.unauthenticated('Session revoked');
    }
    if (session.expiresAt < this.clock.now() || session.user.status !== 'ACTIVE') throw AppError.unauthenticated('Session expired');
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: this.clock.now() } });
    return { tokens: await this.issue(session.user, client, session.family), userId: session.userId };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { refreshHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: this.clock.now() } });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
  }
}
