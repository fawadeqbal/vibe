import { Injectable } from '@nestjs/common';

import { Clock, MS } from '../../common/utils/clock';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';

/** Member = user id, score = when the request lapses (epoch ms). */
const KEY = 'match:waitlist';
/** How long one "notify me" lasts. */
export const WAITLIST_TTL_MS = 3 * MS.hour;
/** At most this many people are pinged for one new searcher (oldest requests first). */
export const NOTIFY_BATCH = 25;

/**
 * "Tell me when someone's looking." For quiet hours: instead of waiting
 * alone on a spinner, people leave a one-shot request. The next person who
 * starts searching and isn't matched straight away wakes them up:
 * `match:someone-looking` in the open app/tab, or a push (via PushBridge)
 * when they're not connected. Each request fires once, then it's gone.
 */
@Injectable()
export class MatchWaitlistService {
  constructor(
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  async add(userId: string): Promise<Date> {
    const until = this.clock.now().getTime() + WAITLIST_TTL_MS;
    await this.redis.client.zadd(KEY, until, userId);
    return new Date(until);
  }

  async remove(userId: string): Promise<void> {
    await this.redis.client.zrem(KEY, userId);
  }

  /** When your request lapses, or null if you have none. */
  async until(userId: string): Promise<Date | null> {
    const score = await this.redis.client.zscore(KEY, userId);
    const at = score == null ? 0 : Number(score);
    return at > this.clock.now().getTime() ? new Date(at) : null;
  }

  /**
   * `searcherId` is now waiting in the queue: wake up to NOTIFY_BATCH people
   * who asked. ZPOPMIN takes them atomically, so two searchers arriving at
   * once never ping the same person twice. Returns who was told.
   */
  async notify(searcherId: string): Promise<string[]> {
    const now = this.clock.now().getTime();
    await this.redis.client.multi().zremrangebyscore(KEY, '-inf', now).zrem(KEY, searcherId).exec();
    const popped = await this.redis.client.zpopmin(KEY, NOTIFY_BATCH);
    const ids: string[] = [];
    for (let i = 0; i < popped.length; i += 2) ids.push(popped[i]);
    // toUser (not toUsers) so PushBridge sees each one and pushes to whoever isn't connected.
    for (const id of ids) this.realtime.toUser(id, ServerEvent.MatchSomeoneLooking, { at: new Date(now).toISOString() });
    return ids;
  }
}
