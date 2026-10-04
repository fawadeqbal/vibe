import { Injectable } from '@nestjs/common';

import { RedisService } from '../../infra/redis/redis.service';
import { ActiveMatch, MatchPrefs } from './matching.types';

const MATCH = (id: string) => `ms:match:${id}`;
const USER = (id: string) => `ms:user:${id}`;
const LAST = (id: string) => `ms:last:${id}`;
const PREFS = (id: string) => `ms:prefs:${id}`;
const ENDING = (id: string) => `ms:ending:${id}`;
const TTL = 6 * 3600;

/** Live calls in Redis: who is talking to whom, plus last partner and filters. */
@Injectable()
export class MatchSessionStore {
  constructor(private readonly redis: RedisService) {}

  async start(m: ActiveMatch): Promise<void> {
    await this.redis.client
      .multi()
      .set(MATCH(m.id), JSON.stringify(m), 'EX', TTL)
      .set(USER(m.a), m.id, 'EX', TTL)
      .set(USER(m.b), m.id, 'EX', TTL)
      .exec();
  }

  get(matchId: string): Promise<ActiveMatch | null> {
    return this.redis.getJson<ActiveMatch>(MATCH(matchId));
  }

  async forUser(userId: string): Promise<ActiveMatch | null> {
    const id = await this.redis.client.get(USER(userId));
    return id ? this.redis.getJson<ActiveMatch>(MATCH(id)) : null;
  }

  /**
   * Ends the match exactly once (concurrent "next" from both sides, or a
   * disconnect racing a skip): only the first caller gets the match back.
   */
  async finish(matchId: string): Promise<ActiveMatch | null> {
    const first = await this.redis.client.set(ENDING(matchId), '1', 'EX', 60, 'NX');
    if (!first) return null;
    const m = await this.redis.getJson<ActiveMatch>(MATCH(matchId));
    if (!m) return null;
    await this.redis.client
      .multi()
      .del(MATCH(matchId))
      .del(USER(m.a))
      .del(USER(m.b))
      .set(LAST(m.a), m.b, 'EX', 3600)
      .set(LAST(m.b), m.a, 'EX', 3600)
      .exec();
    return m;
  }

  lastPartner(userId: string): Promise<string | null> {
    return this.redis.client.get(LAST(userId));
  }

  clearLastPartner(userId: string): Promise<number> {
    return this.redis.client.del(LAST(userId));
  }

  savePrefs(userId: string, prefs: MatchPrefs): Promise<void> {
    return this.redis.setJson(PREFS(userId), prefs, 24 * 3600);
  }

  prefs(userId: string): Promise<MatchPrefs | null> {
    return this.redis.getJson<MatchPrefs>(PREFS(userId));
  }
}
