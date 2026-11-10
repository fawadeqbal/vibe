import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { RedisService } from '../redis/redis.service';
import { ServerEventName, userRoom } from './realtime.events';

const ONLINE_ZSET = 'presence:online';
/** In the app right now: a socket whose app is in the foreground (or whose tab is in use). */
const ACTIVE_ZSET = 'presence:active';
const STALE_MS = 90_000;

/** A socket counts as in use unless its client said otherwise (older apps never say). */
const socketActive = (data: unknown) => (data as { active?: boolean } | undefined)?.active !== false;

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

  /**
   * How many sockets this user has open right now, on every instance (the
   * Redis adapter asks them all). Counting the live sockets — instead of a
   * counter we add to and take from — can't drift: a restart or a crash used
   * to leave the counter too high, so people stayed "online" and were never
   * taken out of the matching queue.
   */
  async socketCount(userId: string): Promise<number> {
    if (!this.server) return 0;
    try {
      return (await this.server.in(userRoom(userId)).fetchSockets()).length;
    } catch (e) {
      this.logger.warn(`socket count for ${userId} failed: ${(e as Error).message}`);
      return 0;
    }
  }

  async markConnected(userId: string): Promise<void> {
    await this.redis.client.zadd(ONLINE_ZSET, Date.now(), userId);
  }

  /** The user's last socket closed: they are offline straight away (not after the 90 s staleness window). */
  async markOffline(userId: string): Promise<void> {
    await this.redis.client.zrem(ONLINE_ZSET, userId);
  }

  private clientsCache: { at: number; map: Map<string, Set<string>> } | null = null;

  /**
   * Who is connected right now and on which Vibe (android / ios / web), from
   * the live sockets on every instance. Someone on the app and the website
   * at once has both. Cached a few seconds: it's for the admin panel.
   */
  async onlineClients(): Promise<Map<string, Set<string>>> {
    if (this.clientsCache && Date.now() - this.clientsCache.at < 5_000) return this.clientsCache.map;
    const map = new Map<string, Set<string>>();
    if (this.server) {
      try {
        for (const s of await this.server.fetchSockets()) {
          const id = (s.data.user as { id?: string } | undefined)?.id;
          if (!id) continue;
          const set = map.get(id) ?? new Set<string>();
          set.add(typeof s.data.client === 'string' ? s.data.client : 'web');
          map.set(id, set);
        }
      } catch (e) {
        this.logger.warn(`listing sockets failed: ${(e as Error).message}`);
      }
    }
    this.clientsCache = { at: Date.now(), map };
    return map;
  }

  /** User ids with a socket on this instance (the interval heartbeats and last-seen refreshes use it). */
  localUserIds(): string[] {
    const ids = new Set<string>();
    for (const s of this.server?.sockets.sockets.values() ?? []) {
      const u = s.data.user as { id?: string } | undefined;
      if (u?.id) ids.add(u.id);
    }
    return [...ids];
  }

  async heartbeat(userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    const now = Date.now();
    const args = userIds.flatMap((id) => [now, id]);
    await this.redis.client.zadd(ONLINE_ZSET, ...(args as [number, string]));
  }

  /**
   * Looking at Vibe right now: the app in the foreground, or a website tab
   * in use. Connected is not enough: a phone keeps its socket for minutes
   * after you leave the app, and a tab can sit open all day. Pushes are
   * skipped only for this (the app shows its own banner instead).
   */
  async isActive(userId: string): Promise<boolean> {
    const score = await this.redis.client.zscore(ACTIVE_ZSET, userId);
    return !!score && Date.now() - Number(score) < STALE_MS;
  }

  async activeMap(userIds: string[]): Promise<Record<string, boolean>> {
    if (!userIds.length) return {};
    const scores = await this.redis.client.zmscore(ACTIVE_ZSET, ...userIds);
    const now = Date.now();
    return Object.fromEntries(userIds.map((id, i) => [id, !!scores[i] && now - Number(scores[i]) < STALE_MS]));
  }

  /**
   * In the app right now: a socket of theirs (any instance) is open and in
   * the foreground (the app in front, a tab in use). Unlike [isActive] it
   * asks the sockets themselves, so it's exact. Calls ring only then.
   */
  async isInApp(userId: string): Promise<boolean> {
    if (!this.server) return false;
    try {
      return (await this.server.in(userRoom(userId)).fetchSockets()).some((s) => socketActive(s.data));
    } catch (e) {
      this.logger.warn(`in-app check for ${userId} failed: ${(e as Error).message}`);
      return false;
    }
  }

  /** After a socket came, went or changed foreground/background: is any of this person's sockets (on any instance) still in use? */
  async refreshActive(userId: string): Promise<boolean> {
    let active = false;
    if (this.server) {
      try {
        active = (await this.server.in(userRoom(userId)).fetchSockets()).some((s) => socketActive(s.data));
      } catch (e) {
        this.logger.warn(`active check for ${userId} failed: ${(e as Error).message}`);
      }
    }
    if (active) await this.redis.client.zadd(ACTIVE_ZSET, Date.now(), userId);
    else await this.redis.client.zrem(ACTIVE_ZSET, userId);
    return active;
  }

  /** User ids with an in-use socket on this instance (the interval keeps them fresh). */
  localActiveUserIds(): string[] {
    const ids = new Set<string>();
    for (const s of this.server?.sockets.sockets.values() ?? []) {
      const u = s.data.user as { id?: string } | undefined;
      if (u?.id && socketActive(s.data)) ids.add(u.id);
    }
    return [...ids];
  }

  async heartbeatActive(userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    const now = Date.now();
    await this.redis.client.zadd(ACTIVE_ZSET, ...(userIds.flatMap((id) => [now, id]) as [number, string]));
  }

  /** Runs [fn] for each of this person's sockets, on any instance (e.g. to close one device's connection). */
  async forUserSockets(userId: string, fn: (s: { data: Record<string, unknown>; emit: (ev: string, data: unknown) => unknown; disconnect: (close?: boolean) => unknown }) => void | Promise<void>): Promise<void> {
    if (!this.server) return;
    try {
      for (const s of await this.server.in(userRoom(userId)).fetchSockets()) await fn(s as never);
    } catch (e) {
      this.logger.warn(`sockets for ${userId} failed: ${(e as Error).message}`);
    }
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
    await this.redis.client.zremrangebyscore(ACTIVE_ZSET, '-inf', Date.now() - STALE_MS);
    return this.redis.client.zremrangebyscore(ONLINE_ZSET, '-inf', Date.now() - STALE_MS);
  }
}
