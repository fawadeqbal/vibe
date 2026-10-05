import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { RedisService } from '../redis/redis.service';
import { ServerEventName, userRoom } from './realtime.events';

const ONLINE_ZSET = 'presence:online';
const SOCKETS = (id: string) => `presence:sockets:${id}`;
const STALE_MS = 90_000;

/**
 * The only way the rest of the code talks to sockets: push an event to a
 * user (on any instance) and ask who is online. Gateways register the
 * server here on init.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;
  private readonly listeners: ((userId: string, event: ServerEventName, payload: unknown) => void)[] = [];

  constructor(private readonly redis: RedisService) {}

  attach(server: Server): void {
    this.server = server;
  }

  get io(): Server | undefined {
    return this.server;
  }

  /**
   * Observers of every per-user event (e.g. push notifications for people
   * who are offline). Listeners must be quick and never throw.
   */
  onUserEvent(fn: (userId: string, event: ServerEventName, payload: unknown) => void): void {
    this.listeners.push(fn);
  }

  toUser(userId: string, event: ServerEventName, payload: unknown): void {
    for (const fn of this.listeners) {
      try {
        fn(userId, event, payload);
      } catch (e) {
        this.logger.warn(`user-event listener failed: ${(e as Error).message}`);
      }
    }
    if (!this.server) return this.logger.debug(`No socket server; dropped ${event}`);
    this.server.to(userRoom(userId)).emit(event, payload);
  }

  toUsers(userIds: string[], event: ServerEventName, payload: unknown): void {
    if (!this.server || !userIds.length) return;
    this.server.to(userIds.map(userRoom)).emit(event, payload);
  }

  /** Everyone connected, on every instance (announcements). */
  toAll(event: ServerEventName, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  /** Disconnects every socket of a user, cluster-wide (bans, sign-out everywhere). */
  disconnectUser(userId: string): void {
    this.server?.in(userRoom(userId)).disconnectSockets(true);
  }

  // ── presence ──────────────────────────────────────────────────────────

  async markConnected(userId: string): Promise<void> {
    await this.redis.client.multi().incr(SOCKETS(userId)).expire(SOCKETS(userId), 86400).zadd(ONLINE_ZSET, Date.now(), userId).exec();
  }

  /** Returns true when that was the user's last socket. */
  async markDisconnected(userId: string): Promise<boolean> {
    const left = await this.redis.client.decr(SOCKETS(userId));
    if (left <= 0) {
      await this.redis.client.multi().del(SOCKETS(userId)).zrem(ONLINE_ZSET, userId).exec();
      return true;
    }
    return false;
  }

  async heartbeat(userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    const now = Date.now();
    const args = userIds.flatMap((id) => [now, id]);
    await this.redis.client.zadd(ONLINE_ZSET, ...(args as [number, string]));
  }

  async isOnline(userId: string): Promise<boolean> {
    const score = await this.redis.client.zscore(ONLINE_ZSET, userId);
    return !!score && Date.now() - Number(score) < STALE_MS;
  }

  async onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    if (!userIds.length) return {};
    const scores = await this.redis.client.zmscore(ONLINE_ZSET, ...userIds);
    const now = Date.now();
    return Object.fromEntries(userIds.map((id, i) => [id, !!scores[i] && now - Number(scores[i]) < STALE_MS]));
  }

  async onlineCount(): Promise<number> {
    return this.redis.client.zcount(ONLINE_ZSET, Date.now() - STALE_MS, '+inf');
  }

  async pruneStale(): Promise<number> {
    return this.redis.client.zremrangebyscore(ONLINE_ZSET, '-inf', Date.now() - STALE_MS);
  }
}
