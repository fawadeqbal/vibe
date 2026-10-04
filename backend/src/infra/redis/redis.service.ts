import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { AppConfig } from '../../config/app-config.service';
import { randomToken } from '../../common/utils/crypto';

/**
 * One shared command connection, plus helpers every module needs: JSON get/set,
 * counters with expiry, and a distributed lock so cron jobs run on exactly
 * one instance.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: AppConfig) {
    this.client = this.create('main');
  }

  /** A fresh connection (pub/sub needs its own). */
  create(name: string): Redis {
    const r = new Redis(this.config.get('REDIS_URL'), { maxRetriesPerRequest: 3, lazyConnect: false, connectionName: `vibe:${name}` });
    r.on('error', (e) => this.logger.warn(`redis(${name}): ${e.message}`));
    return r;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) await this.client.set(key, raw, 'EX', ttlSeconds);
    else await this.client.set(key, raw);
  }

  /**
   * Read-through cache: returns the cached JSON, or computes, stores and
   * returns it. For expensive aggregates (dashboards) shared by all instances.
   */
  async remember<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.getJson<T>(key);
    if (hit !== null) return hit;
    const value = await compute();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  /** INCR with an expiry set on first increment. Returns the new count. */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const [[, count]] = (await this.client.multi().incr(key).expire(key, ttlSeconds, 'NX').exec()) as [[null, number]];
    return count;
  }

  /**
   * Runs `fn` only if this instance wins the lock. Returns undefined when
   * another instance holds it.
   */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
    const token = randomToken(12);
    const ok = await this.client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (!ok) return undefined;
    try {
      return await fn();
    } finally {
      // Release only our own lock.
      await this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        `lock:${key}`,
        token,
      );
    }
  }
}
