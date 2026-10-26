import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SOCKET_CONNECTED, SOCKET_DISCONNECTED, SocketLifecycleEvent } from '../../infra/realtime/realtime.gateway';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * Keeps `User.lastSeenAt` current (daily actives, "last active" in the
 * admin panel). Writes at most once per user per 5 minutes, so reconnect
 * storms don't turn into database writes. Also records each business day a
 * person opens the app (`UserActiveDay`, once per user per day) for the
 * admin funnel's next-day return.
 */
@Injectable()
export class LastSeenListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
  ) {}

  @OnEvent(SOCKET_CONNECTED, { async: true, suppressErrors: true })
  @OnEvent(SOCKET_DISCONNECTED, { async: true, suppressErrors: true })
  async touch(e: SocketLifecycleEvent): Promise<void> {
    await this.markActiveDay(e.userId);
    const fresh = await this.redis.client.set(`lastseen:${e.userId}`, '1', 'EX', 300, 'NX');
    if (fresh !== 'OK') return;
    await this.prisma.user.updateMany({ where: { id: e.userId }, data: { lastSeenAt: this.clock.now() } });
  }

  private async markActiveDay(userId: string): Promise<void> {
    const day = this.clock.dayOf();
    const first = await this.redis.client.set(`activeday:${userId}:${day.toISOString().slice(0, 10)}`, '1', 'EX', 2 * 86_400, 'NX');
    if (first !== 'OK') return;
    await this.prisma.userActiveDay.createMany({ data: [{ userId, day }], skipDuplicates: true });
  }
}
