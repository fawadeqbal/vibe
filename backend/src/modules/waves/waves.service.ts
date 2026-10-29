import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { MailProvider } from '../../infra/mail/mail.provider';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MailTemplatesService } from '../messaging/mail-templates.service';
import { unsubscribeUrl } from '../messaging/unsubscribe';
import { BlocksService } from '../social/blocks.service';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';

/** "Recently here" lists people seen in this window. */
export const RECENT_WINDOW = 2 * MS.day;
/** A wave counts (list, badge, matched first) for this long. */
export const WAVE_LIFETIME = 7 * MS.day;
/** Waving at the same person again within this re-sends nothing. */
export const REWAVE_AFTER = MS.day;
/** Matched first with people you waved with this recently. */
export const PREFER_WITHIN = 3 * MS.day;
export const MAX_WAVES_PER_DAY = 20;
export const RECENT_LIMIT = 30;
/** "Ali is looking for a match now" at most this often per pair. */
const LOOKING_EVERY_S = 3 * 3600;

export interface RecentPerson {
  profile: PublicProfile;
  online: boolean;
  lastSeenAt: string | null;
  /** You waved at them (in the last 7 days). */
  iWaved: boolean;
  /** They waved at you (in the last 7 days). */
  wavedAtMe: boolean;
}

export interface ReceivedWave {
  profile: PublicProfile;
  online: boolean;
  at: string;
  seen: boolean;
  /** You waved back. */
  wavedBack: boolean;
}

/**
 * Waves: a light way to connect when nobody's live. "Recently here" shows
 * real people seen in the last two days; a wave tells them (in the app, by
 * push, or by e-mail on the web), and people who waved either way are
 * matched first when both are searching. No bots: dev bots, private
 * accounts, blocked people and banned people never appear.
 */
@Injectable()
export class WavesService {
  private readonly logger = new Logger(WavesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly blocks: BlocksService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly mail: MailProvider,
    private readonly templates: MailTemplatesService,
  ) {}

  /** Who can be waved at: real, active, set up, public, not banned, not blocked either way. */
  private async visibleWhere(me: string) {
    const now = this.clock.now();
    const excluded = [...(await this.blocks.excluded(me)), me];
    return {
      id: { notIn: excluded },
      isBot: false,
      status: UserStatus.ACTIVE,
      privateAccount: false,
      onboardedAt: { not: null },
      age: { gte: 18 },
      OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }],
    };
  }

  async recent(me: string): Promise<RecentPerson[]> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - RECENT_WINDOW);
    const where = await this.visibleWhere(me);
    const people = await this.prisma.user.findMany({ where: { ...where, lastSeenAt: { gte: since } }, orderBy: { lastSeenAt: 'desc' }, take: RECENT_LIMIT, include: PROFILE_INCLUDE });
    const ids = people.map((p) => p.id);
    if (!ids.length) return [];
    const waveSince = new Date(now.getTime() - WAVE_LIFETIME);
    const [waves, online] = await Promise.all([
      this.prisma.wave.findMany({ where: { createdAt: { gte: waveSince }, OR: [{ fromId: me, toId: { in: ids } }, { toId: me, fromId: { in: ids } }] }, select: { fromId: true, toId: true } }),
      this.realtime.onlineMap(ids),
    ]);
    const iWaved = new Set(waves.filter((w) => w.fromId === me).map((w) => w.toId));
    const wavedAtMe = new Set(waves.filter((w) => w.toId === me).map((w) => w.fromId));
    const rank = (p: RecentPerson) => (p.wavedAtMe && !p.iWaved ? 0 : p.online ? 1 : 2);
    return people
      .map((u) => ({ profile: toPublicProfile(u, now), online: !!online[u.id], lastSeenAt: u.lastSeenAt?.toISOString() ?? null, iWaved: iWaved.has(u.id), wavedAtMe: wavedAtMe.has(u.id) }))
      .sort((a, b) => rank(a) - rank(b) || (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  }

  async received(me: string): Promise<{ items: ReceivedWave[]; unseen: number }> {
    const now = this.clock.now();
    const where = await this.visibleWhere(me);
    const waves = await this.prisma.wave.findMany({
      where: { toId: me, createdAt: { gte: new Date(now.getTime() - WAVE_LIFETIME) }, from: where },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { from: { include: PROFILE_INCLUDE } },
    });
    const ids = waves.map((w) => w.fromId);
    const [back, online] = await Promise.all([
      ids.length ? this.prisma.wave.findMany({ where: { fromId: me, toId: { in: ids }, createdAt: { gte: new Date(now.getTime() - WAVE_LIFETIME) } }, select: { toId: true } }) : [],
      this.realtime.onlineMap(ids),
    ]);
    const wavedBack = new Set(back.map((b) => b.toId));
    const items = waves.map((w) => ({ profile: toPublicProfile(w.from, now), online: !!online[w.fromId], at: w.createdAt.toISOString(), seen: !!w.seenAt, wavedBack: wavedBack.has(w.fromId) }));
    return { items, unseen: items.filter((i) => !i.seen).length };
  }

  async markSeen(me: string): Promise<void> {
    await this.prisma.wave.updateMany({ where: { toId: me, seenAt: null }, data: { seenAt: this.clock.now() } });
  }

  /** Wave at someone. Returns whether it's mutual (they waved at you too). */
  async wave(me: string, toId: string): Promise<{ mutual: boolean; sent: boolean }> {
    if (toId === me) throw new AppError(ErrorCode.VALIDATION_FAILED, "You can't wave at yourself", HttpStatus.BAD_REQUEST);
    const target = await this.prisma.user.findFirst({ where: { AND: [{ id: toId }, await this.visibleWhere(me)] }, include: PROFILE_INCLUDE });
    if (!target) throw AppError.notFound('User');
    const now = this.clock.now();
    const existing = await this.prisma.wave.findUnique({ where: { fromId_toId: { fromId: me, toId } } });
    const mutual = !!(await this.prisma.wave.findFirst({ where: { fromId: toId, toId: me, createdAt: { gte: new Date(now.getTime() - WAVE_LIFETIME) } } }));
    // Waved recently already: nothing new to tell them.
    if (existing && now.getTime() - existing.createdAt.getTime() < REWAVE_AFTER) return { mutual, sent: false };
    const used = await this.redis.incrWithTtl(`waves:${me}:${this.clock.dayIndex()}`, 2 * 86_400);
    if (used > MAX_WAVES_PER_DAY) throw new AppError(ErrorCode.RATE_LIMITED, `That's ${MAX_WAVES_PER_DAY} waves today. Try again tomorrow.`, HttpStatus.TOO_MANY_REQUESTS);

    await this.prisma.wave.upsert({ where: { fromId_toId: { fromId: me, toId } }, create: { fromId: me, toId }, update: { createdAt: now, seenAt: null } });
    const from = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, include: PROFILE_INCLUDE });
    this.realtime.toUser(toId, ServerEvent.WaveNew, { from: toPublicProfile(from, now), mutual });
    await this.emailIfUnreachable(target, from.name, mutual);
    return { mutual, sent: true };
  }

  /**
   * People without the app and not online would never see a wave: one
   * e-mail a day at most, only with e-mail updates on.
   */
  private async emailIfUnreachable(to: { id: string; email: string | null; name: string; marketingEmails: boolean }, fromName: string, mutual: boolean): Promise<void> {
    try {
      if (!to.email || !to.marketingEmails || (await this.realtime.isOnline(to.id))) return;
      if (await this.prisma.pushToken.findFirst({ where: { userId: to.id }, select: { id: true } })) return;
      const first = await this.redis.client.set(`waves:mail:${to.id}:${this.clock.dayIndex()}`, '1', 'EX', 2 * 86_400, 'NX');
      if (first !== 'OK') return;
      const unsub = unsubscribeUrl(this.config.get('PUBLIC_URL'), to.id, this.config.get('JWT_ACCESS_SECRET'));
      const m = await this.templates.render(
        'wave_received',
        { name: to.name || 'there', email: to.email, from: fromName.split(/\s+/)[0] || 'Someone', back: mutual ? ' back' : '', appUrl: `${this.config.get('WEB_APP_URL').replace(/\/$/, '')}/match` },
        { unsubscribeUrl: unsub },
      );
      await this.mail.send({ to: to.email, subject: m.subject, html: m.html, text: m.text, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
    } catch (e) {
      this.logger.warn(`wave e-mail to ${to.id} failed: ${(e as Error).message}`);
    }
  }

  /** People you waved with (either way) recently: the matcher pairs you first. */
  async wavedWith(me: string): Promise<string[]> {
    const since = new Date(this.clock.now().getTime() - PREFER_WITHIN);
    const rows = await this.prisma.wave.findMany({ where: { createdAt: { gte: since }, OR: [{ fromId: me }, { toId: me }] }, select: { fromId: true, toId: true } });
    return [...new Set(rows.map((r) => (r.fromId === me ? r.toId : r.fromId)))];
  }

  /**
   * `searcherId` started looking and is waiting: tell the people they
   * waved with (who aren't busy) — "Sara is looking for a match now".
   * At most once per pair every 3 hours.
   */
  async announceLooking(searcherId: string, busy: (userId: string) => Promise<boolean>): Promise<string[]> {
    const ids = await this.wavedWith(searcherId);
    if (!ids.length) return [];
    const blocked = await this.blocks.excluded(searcherId);
    const now = this.clock.now();
    const from = await this.prisma.user.findUnique({ where: { id: searcherId }, include: PROFILE_INCLUDE });
    if (!from) return [];
    const told: string[] = [];
    for (const id of ids) {
      if (blocked.has(id) || (await busy(id))) continue;
      const [a, b] = [searcherId, id].sort();
      if ((await this.redis.client.set(`waves:looking:${a}:${b}:${searcherId}`, '1', 'EX', LOOKING_EVERY_S, 'NX')) !== 'OK') continue;
      this.realtime.toUser(id, ServerEvent.WaveLooking, { from: toPublicProfile(from, now) });
      told.push(id);
    }
    return told;
  }
}
