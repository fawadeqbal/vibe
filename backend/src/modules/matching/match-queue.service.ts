import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.service';
import { RedisService } from '../../infra/redis/redis.service';
import { pickPartner, queueScore } from './compatibility';
import { Ticket } from './matching.types';

const QUEUE = 'mq:queue';
const TICKET = (id: string) => `mq:ticket:${id}`;
const TICKET_TTL = 15 * 60;

/**
 * Removes both users from the queue only if both are still in it — the
 * atomic step that makes pairing safe across any number of instances.
 */
const CLAIM_PAIR = `
if redis.call('ZSCORE', KEYS[1], ARGV[1]) and redis.call('ZSCORE', KEYS[1], ARGV[2]) then
  redis.call('ZREM', KEYS[1], ARGV[1], ARGV[2])
  return 1
end
return 0`;

/**
 * The waiting room, in Redis: a sorted set ordered by (time − priority
 * head start) plus one JSON ticket per waiting user.
 */
@Injectable()
export class MatchQueueService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  async enqueue(t: Ticket, score = queueScore(t)): Promise<void> {
    await this.redis.client.multi().set(TICKET(t.userId), JSON.stringify(t), 'EX', TICKET_TTL).zadd(QUEUE, score, t.userId).exec();
  }

  async remove(userId: string): Promise<boolean> {
    const [[, removed]] = (await this.redis.client.multi().zrem(QUEUE, userId).del(TICKET(userId)).exec()) as [[null, number], [null, number]];
    return removed > 0;
  }

  async isQueued(userId: string): Promise<boolean> {
    return (await this.redis.client.zscore(QUEUE, userId)) !== null;
  }

  async ticket(userId: string): Promise<Ticket | null> {
    return this.redis.getJson<Ticket>(TICKET(userId));
  }

  async size(): Promise<number> {
    return this.redis.client.zcard(QUEUE);
  }

  /** The longest-waiting user ids (for the sweeper). */
  async head(n: number): Promise<string[]> {
    return this.redis.client.zrange(QUEUE, 0, n - 1);
  }

  /**
   * Finds and atomically claims a partner for `userId`. Returns the partner's
   * ticket, or null if nobody compatible is waiting (or someone else won
   * the race — the caller simply tries again later).
   */
  async claimPartner(userId: string): Promise<{ me: Ticket; partner: Ticket } | null> {
    const me = await this.ticket(userId);
    if (!me) return null;
    const ids = (await this.redis.client.zrange(QUEUE, 0, this.config.get('MATCH_SCAN_LIMIT') - 1)).filter((id) => id !== userId);
    if (!ids.length) return null;
    const raw = await this.redis.client.mget(ids.map(TICKET));
    const candidates = raw.flatMap((r) => (r ? [JSON.parse(r) as Ticket] : []));
    const partner = pickPartner(me, candidates);
    if (!partner) return null;
    const claimed = await this.redis.client.eval(CLAIM_PAIR, 1, QUEUE, userId, partner.userId);
    if (claimed !== 1) return null;
    await this.redis.client.del(TICKET(userId), TICKET(partner.userId));
    return { me, partner };
  }
}
