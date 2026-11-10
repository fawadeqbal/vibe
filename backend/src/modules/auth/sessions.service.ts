import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import type { AuthUser } from '../../common/types/auth-user';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { clientKind } from '../platforms/client-kind';
import { deviceLabel } from './device-label';
import { TokenService } from './token.service';

/** One device you're signed in on (Settings → Devices). */
export interface DeviceSessionView {
  /** The sign-in (session family): stays the same while the app refreshes its tokens. */
  id: string;
  client: 'android' | 'ios' | 'web';
  device: string;
  signedInAt: string;
  /** Its last token refresh: about when it was last used (refreshes run every 15 minutes in use). */
  lastActiveAt: string;
  current: boolean;
}

export interface AdminDeviceSessionView extends DeviceSessionView {
  ip: string | null;
  userAgent: string | null;
}

export type EndReason = 'remote' | 'admin';

/**
 * Where you're signed in, and signing devices out. Ending a sign-in revokes
 * its refresh token, makes its current access token stop working at once
 * (TokenService.markEnded) and tells its live connection, so the app or tab
 * goes back to sign-in straight away.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  async list(userId: string, me?: AuthUser): Promise<AdminDeviceSessionView[]> {
    const now = this.clock.now();
    const live = await this.prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } });
    const families = [...new Set(live.map((s) => s.family))];
    if (!families.length) return [];
    const firsts = await this.prisma.session.groupBy({ by: ['family'], where: { userId, family: { in: families } }, _min: { createdAt: true } });
    const since = new Map(firsts.map((f) => [f.family, f._min.createdAt ?? now]));
    const current = me ? await this.familyOf(me) : null;
    const seen = new Set<string>();
    const rows: AdminDeviceSessionView[] = [];
    for (const s of live) {
      if (seen.has(s.family)) continue;
      seen.add(s.family);
      const client = (s.client === 'android' || s.client === 'ios' || s.client === 'web' ? s.client : clientKind({ 'user-agent': s.userAgent ?? '' })) as DeviceSessionView['client'];
      rows.push({
        id: s.family,
        client,
        device: s.device ?? deviceLabel({ userAgent: s.userAgent, client }),
        signedInAt: (since.get(s.family) ?? s.createdAt).toISOString(),
        lastActiveAt: s.createdAt.toISOString(),
        current: s.family === current,
        ip: s.ip,
        userAgent: s.userAgent,
      });
    }
    // This device first, then the most recently used.
    return rows.sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  /** What the person sees (no IP or raw user agent). */
  async listMine(me: AuthUser): Promise<DeviceSessionView[]> {
    return (await this.list(me.id, me)).map(({ ip: _ip, userAgent: _ua, ...rest }) => rest);
  }

  /** Signs one device out. 404 when it isn't one of yours (or already signed out). */
  async end(userId: string, family: string, reason: EndReason): Promise<{ ended: number }> {
    const r = await this.prisma.session.updateMany({ where: { userId, family, revokedAt: null }, data: { revokedAt: this.clock.now(), revokeReason: reason } });
    if (!r.count) throw AppError.notFound('Device');
    await this.after(userId, [family]);
    return { ended: 1 };
  }

  /** Every device but this one (or, without `keep`, every device). */
  async endAll(userId: string, reason: EndReason, keep?: string | null): Promise<{ ended: number }> {
    const live = await this.prisma.session.findMany({ where: { userId, revokedAt: null, ...(keep ? { family: { not: keep } } : {}) }, select: { family: true } });
    const families = [...new Set(live.map((s) => s.family))];
    if (!families.length) return { ended: 0 };
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null, family: { in: families } }, data: { revokedAt: this.clock.now(), revokeReason: reason } });
    await this.after(userId, families);
    return { ended: families.length };
  }

  /** The sign-in this request comes from (tokens from before carry only the row id). */
  async familyOf(me: AuthUser): Promise<string | null> {
    if (me.family) return me.family;
    const s = await this.prisma.session.findUnique({ where: { id: me.sessionId }, select: { family: true } });
    return s?.family ?? null;
  }

  private async after(userId: string, families: string[]): Promise<void> {
    await this.tokens.markEnded(families);
    const set = new Set(families);
    await this.realtime.forUserSockets(userId, async (s) => {
      const fam = (s.data.user as AuthUser | undefined)?.family;
      if (!fam || !set.has(fam)) return;
      s.emit(ServerEvent.SessionEnded, { reason: 'signed_out_elsewhere' });
      // A moment for the message to arrive before the line closes.
      setTimeout(() => s.disconnect(true), 300);
    });
    // Older tokens (no family on the socket): their devices notice at the next refresh.
  }
}
