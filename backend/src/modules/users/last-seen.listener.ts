import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SOCKET_CONNECTED, SOCKET_DISCONNECTED, SocketLifecycleEvent } from '../../infra/realtime/realtime.gateway';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';

/** While someone stays connected, `lastSeenAt` is refreshed this often. */
export const LAST_SEEN_REFRESH_MS = 5 * 60_000;

/**
 * Keeps `User.lastSeenAt` current — friends' "Last seen 5 min ago",
 * Discover's "Active 2h ago", daily actives, "last active" in admin:
 *
 *  - when the last socket closes, it is the moment they left (always written);
 *  - on connect, at most once per 5 minutes per person (reconnect storms);
 *  - every 5 minutes for everyone still connected, so a long session or a
 *    server that dies without disconnect events is never hours behind.
 *
 * Also records each business day a person opens the app (`UserActiveDay`,
 * once per user per day) for the admin funnel's next-day return.
 */
@Injectable()
export class LastSeenListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  @OnEvent(SOCKET_CONNECTED, { async: true, suppressErrors: true })
  async onConnect(e: SocketLifecycleEvent): Promise<void> {
    await this.markActiveDay(e.userId);
    const fresh = await this.redis.client.set(`lastseen:${e.userId}`, '1', 'PX', LAST_SEEN_REFRESH_MS, 'NX');
    if (fresh !== 'OK') return;
    await this.prisma.user.updateMany({ where: { id: e.userId }, data: { lastSeenAt: this.clock.now() } });
  }

  @OnEvent(SOCKET_DISCONNECTED, { async: true, suppressErrors: true })
  async onDisconnect(e: SocketLifecycleEvent): Promise<void> {
    if (!e.lastSocket) return;
    await this.prisma.user.updateMany({ where: { id: e.userId }, data: { lastSeenAt: this.clock.now() } });
  }

  @Interval(LAST_SEEN_REFRESH_MS)
  async refresh(): Promise<void> {
    const ids = this.realtime.localUserIds();
    if (ids.length) await this.prisma.user.updateMany({ where: { id: { in: ids } }, data: { lastSeenAt: this.clock.now() } });
  }

  private async markActiveDay(userId: string): Promise<void> {
    const day = this.clock.dayOf();
    const first = await this.redis.client.set(`activeday:${userId}:${day.toISOString().slice(0, 10)}`, '1', 'EX', 2 * 86_400, 'NX');
    if (first !== 'OK') return;
    await this.prisma.userActiveDay.createMany({ data: [{ userId, day }], skipDuplicates: true });
  }
}
