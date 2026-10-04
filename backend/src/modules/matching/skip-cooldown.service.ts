import { Injectable } from '@nestjs/common';

import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';

const SKIPS = (id: string) => `skips:${id}`;
const COOLDOWN = (id: string) => `skips:cooldown:${id}`;

/**
 * Five quick skips (calls under 10 s) within a minute → the next skip
 * waits 10 s, unless the user pays to skip the wait.
 */
@Injectable()
export class SkipCooldownService {
  constructor(
    private readonly redis: RedisService,
    private readonly economy: EconomyService,
  ) {}

  async secondsLeft(userId: string): Promise<number> {
    const ms = await this.redis.client.pttl(COOLDOWN(userId));
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }

  async clear(userId: string): Promise<void> {
    await this.redis.client.del(COOLDOWN(userId));
  }

  /** Records a skip; returns the cooldown it triggered (seconds, 0 if none). */
  async noteSkip(userId: string, callSeconds: number): Promise<number> {
    if (callSeconds >= this.economy.rules.quickSkipSeconds) return 0;
    const now = Date.now();
    const key = SKIPS(userId);
    const res = await this.redis.client
      .multi()
      .zadd(key, now, `${now}:${Math.random()}`)
      .zremrangebyscore(key, '-inf', now - this.economy.rules.skipWindowSeconds * 1000)
      .zcard(key)
      .expire(key, this.economy.rules.skipWindowSeconds)
      .exec();
    const count = Number(res?.[2]?.[1] ?? 0);
    if (count >= this.economy.rules.skipsBeforeCooldown) {
      await this.redis.client.multi().set(COOLDOWN(userId), '1', 'EX', this.economy.rules.skipCooldownSeconds).del(key).exec();
      return this.economy.rules.skipCooldownSeconds;
    }
    return 0;
  }
}
