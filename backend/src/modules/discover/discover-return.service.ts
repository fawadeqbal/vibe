import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { DiscoverService } from './discover.service';

/** Away at least this long before "welcome back" shows. */
export const WELCOME_AFTER_DAYS = 2;
const SUBSCRIBERS = 'discover:notify-new';
const SCANNED_AT = 'discover:new-scan-at';
const TOLD = (id: string) => `discover:new-told:${id}`;
const SCAN_MS = 5 * MS.minute;

export interface WelcomeBack {
  show: boolean;
  awayDays: number;
  /** New likes waiting since you were last here. */
  likesSince: number;
  /** People who joined Discover since then. */
  newPeople: number;
}

/**
 * Bringing people back to Discover: the "welcome back" numbers (what
 * happened while you were away) and "tell me when new people join"
 * (a push or in-app ping, at most once a day).
 */
@Injectable()
export class DiscoverReturnService {
  private readonly logger = new Logger(DiscoverReturnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly discover: DiscoverService,
  ) {}

  /** What happened since your last visit; also records this visit. */
  async welcome(me: string): Promise<WelcomeBack> {
    const now = this.clock.now();
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, select: { discoverSeenAt: true } });
    await this.prisma.user.update({ where: { id: me }, data: { discoverSeenAt: now } });
    const prev = u.discoverSeenAt;
    const awayDays = prev ? Math.floor((now.getTime() - prev.getTime()) / MS.day) : 0;
    if (!prev || awayDays < WELCOME_AFTER_DAYS) return { show: false, awayDays, likesSince: 0, newPeople: 0 };
    const [likesSince, newPeople] = await Promise.all([
      this.prisma.discoverSwipe.count({ where: { ...(await this.discover.pendingLikesWhere(me)), createdAt: { gte: prev } } }),
      this.prisma.user.count({ where: { AND: [this.discover.visibleWhere(now), { id: { not: me }, onboardedAt: { gte: prev } }] } }),
    ]);
    return { show: likesSince > 0 || newPeople > 0, awayDays, likesSince, newPeople };
  }

  async notifyOn(me: string): Promise<boolean> {
    return (await this.redis.client.sismember(SUBSCRIBERS, me)) === 1;
  }

  async setNotify(me: string, on: boolean): Promise<boolean> {
    if (on) await this.redis.client.sadd(SUBSCRIBERS, me);
    else await this.redis.client.srem(SUBSCRIBERS, me);
    return on;
  }

  @Interval(SCAN_MS)
  async tick(): Promise<void> {
    await this.redis.withLock('discover-new-scan', SCAN_MS, () => this.scan()).catch((e) => this.logger.warn(`new-people scan: ${e.message}`));
  }

  /**
   * Who became visible since the last scan; everyone who asked hears about
   * it (not about themselves), at most once a day. Returns who was told.
   */
  async scan(now: Date = this.clock.now()): Promise<string[]> {
    const last = Number(await this.redis.client.get(SCANNED_AT)) || now.getTime() - SCAN_MS;
    await this.redis.client.set(SCANNED_AT, String(now.getTime()));
    const fresh = await this.prisma.user.findMany({
      where: { AND: [this.discover.visibleWhere(now), { onboardedAt: { gte: new Date(last), lt: now } }] },
      select: { id: true },
      take: 100,
    });
    if (!fresh.length) return [];
    const told: string[] = [];
    for (const id of await this.redis.client.smembers(SUBSCRIBERS)) {
      const count = fresh.filter((f) => f.id !== id).length;
      if (!count) continue;
      if (!(await this.redis.client.set(TOLD(id), '1', 'EX', 24 * 60 * 60, 'NX'))) continue;
      this.realtime.toUser(id, ServerEvent.DiscoverNewPeople, { count });
      told.push(id);
    }
    return told;
  }
}
