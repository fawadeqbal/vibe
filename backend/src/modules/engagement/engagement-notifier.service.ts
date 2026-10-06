import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UserStatus } from '@prisma/client';

import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { PushService } from '../push/push.service';
import { StreakService } from '../social/streak.service';
import { EngagementService } from './engagement.service';
import { RecapService, recapText, recapWorthSending } from './recap.service';
import { lastVibeHourEnded } from './vibe-hour';

/** Business-time minutes the daily jobs run at (or right after, if an instance was down). */
export const STREAK_RISK_AT = 20 * 60;
export const WINBACK_AT = 12 * 60;
export const RECAP_AT = 10 * 60;
const BATCH = 500;

/**
 * Time-based engagement jobs. A 1-minute tick under a Redis lock; each job
 * claims a Redis day/week key (SET NX) so it runs once across all
 * instances, even if the tick fires late. Pushes go out with category
 * `engagement` (capped per day, held during quiet hours, see PushService).
 */
@Injectable()
export class EngagementNotifier {
  private readonly logger = new Logger(EngagementNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly engagement: EngagementService,
    private readonly streaks: StreakService,
    private readonly recaps: RecapService,
    private readonly config: AppConfig,
  ) {}

  /** Tests call the jobs directly (with a controlled clock) instead of racing the wall clock. */
  @Interval(MS.minute)
  async scheduled(): Promise<void> {
    if (!this.config.isTest) await this.tick();
  }

  async tick(): Promise<void> {
    await this.redis.withLock('engagement-notifier', 55_000, async () => {
      try {
        await this.vibeHourEdges();
        const minute = this.clock.minuteOfDay();
        const day = this.clock.dayIndex();
        if (minute >= STREAK_RISK_AT) await this.once(`eng:job:streak-risk:${day}`, () => this.streakRisk());
        if (minute >= WINBACK_AT) await this.once(`eng:job:winback:${day}`, () => this.winback());
        if (this.clock.weekday() === 0 && minute >= RECAP_AT) await this.once(`eng:job:recap:${this.clock.weekIndex()}`, () => this.weeklyRecap());
      } catch (e) {
        this.logger.error(`engagement tick failed: ${(e as Error).message}`);
      }
    });
  }

  private async once(key: string, job: () => Promise<number>): Promise<void> {
    if ((await this.redis.client.set(key, '1', 'EX', 8 * 86_400, 'NX')) !== 'OK') return;
    const n = await job();
    this.logger.log(`${key}: ${n}`);
  }

  // ── Vibe Hour ────────────────────────────────────────────────────────────

  /** Broadcast `engagement:vibe-hour` at start and end (once per window), and push the start. */
  async vibeHourEdges(): Promise<void> {
    const now = this.clock.now();
    const w = this.engagement.window(now);
    if (w.active && (await this.redis.client.set(`eng:vh:start:${w.day}`, '1', 'EX', 2 * 86_400, 'NX')) === 'OK') {
      this.realtime.toAll(ServerEvent.VibeHour, this.engagement.vibeHour(now));
      await this.vibeHourPush();
      return;
    }
    const r = this.economy.rules;
    const ended = lastVibeHourEnded(now.getTime(), this.clock.offsetMinutes, r.vibeHourStart, r.vibeHourMinutes);
    // Only announce an end that just happened (not one from hours ago after a restart).
    if (!w.active && ended && now.getTime() - ended.endsAt.getTime() < 30 * MS.minute && (await this.redis.client.set(`eng:vh:end:${ended.day}`, '1', 'EX', 2 * 86_400, 'NX')) === 'OK') {
      this.realtime.toAll(ServerEvent.VibeHour, this.engagement.vibeHour(now));
    }
  }

  /** People active in the last 3 days who are not in the app right now. */
  private async vibeHourPush(): Promise<number> {
    const since = new Date(this.clock.now().getTime() - 3 * MS.day);
    const minutes = this.economy.rules.vibeHourMinutes;
    let sent = 0;
    await this.eachUser({ lastSeenAt: { gte: since } }, async (ids) => {
      const online = await this.realtime.onlineMap(ids);
      for (const id of ids.filter((x) => !online[x])) {
        sent += await this.push.sendToUser(id, { title: 'Vibe Hour is live 🔥', body: `Free filters and double XP for the next ${minutes} min`, data: { route: 'match' }, category: 'engagement', collapseKey: 'vibe-hour' });
      }
    });
    return sent;
  }

  // ── streaks ──────────────────────────────────────────────────────────────

  /** 20:00: "Your 12-day streak with Ali ends at midnight" to each side not active today. */
  async streakRisk(): Promise<number> {
    const today = this.clock.dayIndex();
    let sent = 0;
    for (let cursor: string | undefined; ; ) {
      const pairs = await this.streaks.atRiskPairs(cursor, BATCH);
      if (!pairs.length) break;
      cursor = pairs[pairs.length - 1].id;
      const users = await this.prisma.user.findMany({ where: { id: { in: pairs.flatMap((p) => [p.userLowId, p.userHighId]) } }, select: { id: true, name: true, status: true, isBot: true } });
      const byId = new Map(users.map((u) => [u.id, u]));
      for (const f of pairs) {
        if (!(await this.firstForPair(`eng:streak-risk:${f.id}:${today}`))) continue;
        for (const [me, other, myDay] of [
          [f.userLowId, f.userHighId, f.streakLowDay],
          [f.userHighId, f.userLowId, f.streakHighDay],
        ] as const) {
          const u = byId.get(me);
          if (myDay === today || !u || u.isBot || u.status !== UserStatus.ACTIVE) continue;
          const name = byId.get(other)?.name || 'your friend';
          sent += await this.push.sendToUser(me, { title: `🔥 ${f.streakCount}-day streak`, body: `Your ${f.streakCount}-day streak with ${name} ends at midnight`, data: { route: 'chat', friendId: other }, category: 'engagement', collapseKey: `streak:${other}` });
        }
      }
      if (pairs.length < BATCH) break;
    }
    return sent;
  }

  private async firstForPair(key: string): Promise<boolean> {
    return (await this.redis.client.set(key, '1', 'EX', 2 * 86_400, 'NX')) === 'OK';
  }

  // ── win-back ─────────────────────────────────────────────────────────────

  /** 12:00: people last seen 7–8 days ago get a free boost (at most every 60 days) and a push. */
  async winback(): Promise<number> {
    const now = this.clock.now();
    const from = new Date(now.getTime() - 8 * MS.day);
    const to = new Date(now.getTime() - 7 * MS.day);
    const cooldown = new Date(now.getTime() - 60 * MS.day);
    const eligible = { lastSeenAt: { gte: from, lt: to }, OR: [{ winbackAt: null }, { winbackAt: { lt: cooldown } }] };
    let given = 0;
    await this.eachUser(eligible, async (ids) => {
      for (const id of ids) {
        const won = await this.prisma.$transaction(async (tx) => {
          // Claim first: two runs can never give the same person two boosts.
          const claimed = await tx.user.updateMany({ where: { id, ...eligible }, data: { winbackAt: now } });
          if (!claimed.count) return false;
          await tx.wallet.update({ where: { userId: id }, data: { freeBoosts: { increment: 1 } } });
          return true;
        });
        if (!won) continue;
        given++;
        await this.push.sendToUser(id, { title: 'We miss you 👋', body: `A free ${this.economy.rules.boostMinutes}-min boost is waiting for you`, data: { route: 'wallet' }, category: 'engagement', collapseKey: 'winback' });
      }
    });
    return given;
  }

  // ── weekly recap ─────────────────────────────────────────────────────────

  /** Monday 10:00: an inbox message (and a push) for people active last week who received anything. */
  async weeklyRecap(): Promise<number> {
    const { week, from } = this.recaps.lastWeek();
    let sent = 0;
    await this.eachUser({ lastSeenAt: { gte: from } }, async (ids) => {
      const recaps = await this.recaps.forUsers(ids);
      const online = await this.realtime.onlineMap(ids);
      for (const id of ids) {
        const r = recaps.get(id)!;
        if (!recapWorthSending(r) || !(await this.firstForPair(`eng:recap:${week}:${id}`))) continue;
        const msg = await this.prisma.userMessage.create({ data: { userId: id, title: 'Your week on Vibe', body: recapText(r) } });
        sent++;
        if (online[id]) this.realtime.toUsers([id], ServerEvent.InboxMessage, { id: msg.id, campaignId: null, title: msg.title, body: msg.body, buttonLabel: null, buttonUrl: null });
        else await this.push.sendToUser(id, { title: 'Your week on Vibe ✨', body: `${r.likesReceived} likes, ${r.giftsReceived} gifts, ${r.gemsEarned} gems — see your recap`, data: { route: 'inbox' }, category: 'engagement', collapseKey: 'recap' });
      }
    });
    return sent;
  }

  /** Real, active, unbanned people matching `where`, in id-ordered batches. */
  private async eachUser(where: object, fn: (ids: string[]) => Promise<void>): Promise<void> {
    const now = this.clock.now();
    for (let cursor: string | undefined; ; ) {
      const rows = await this.prisma.user.findMany({
        where: { AND: [where, { status: UserStatus.ACTIVE, isBot: false, OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] }], ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (!rows.length) return;
      cursor = rows[rows.length - 1].id;
      await fn(rows.map((r) => r.id));
      if (rows.length < BATCH) return;
    }
  }
}
