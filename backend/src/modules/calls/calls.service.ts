import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { FriendshipStatus, MessageKind } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { MATCH_ENDED, type MatchEndedEvent, MatchingService } from '../matching/matching.service';
import { BlocksService, USER_BLOCKED, type UserBlockedEvent } from '../social/blocks.service';
import { callsView, type CallsView, FriendsService } from '../social/friends.service';
import { MessagesService } from '../social/messages.service';
import { PROFILE_INCLUDE, type PublicProfile, toPublicProfile } from '../users/user.mapper';

export type CallMedia = 'voice' | 'video';

/** Where a call is. It ends exactly once, with a reason. (The design: "Calls: one state machine on the server".) */
export type CallStatus = 'ringing' | 'connecting' | 'live' | 'ended';

/**
 * Why it ended. unavailable: they weren't in the app · busy: on another
 * call · cancelled: the caller hung up while it rang · declined · no_answer:
 * rang out · gone: they left the app while it rang · failed: picked up but
 * the media never started · hung_up / dropped: a call that ended ·
 * turned_off: calls were turned off (or a block) while it rang.
 */
export type CallEndReason = 'unavailable' | 'busy' | 'cancelled' | 'declined' | 'no_answer' | 'gone' | 'failed' | 'hung_up' | 'dropped' | 'turned_off';

/** One call, as the server keeps it (Redis, JSON). Only [CallsService.move] changes it. */
export interface CallRecord {
  id: string;
  from: string;
  to: string;
  friendshipId: string;
  video: boolean;
  state: CallStatus;
  reason: CallEndReason | null;
  /** Goes up with every change: devices keep the highest they've seen. */
  version: number;
  /** Their device is showing it ("Ringing…" rather than "Calling…"). */
  reached: boolean;
  /** The device that picked up; the others close. */
  answeredBy: string | null;
  matchId: string | null;
  /** Their quick reply when they declined. */
  reply: string | null;
  createdAt: number;
  /** When it stops ringing. */
  expiresAt: number;
  connectingAt: number | null;
  liveAt: number | null;
  endedAt: number | null;
  /** Each side's media is flowing (both → live). */
  upFrom: boolean;
  upTo: boolean;
  /** The person called left the app while it rang (gone after a grace). */
  awayAt: number | null;
}

/** What every device of both people gets (`call:state`) and draws from. */
export interface CallSnapshot {
  callId: string;
  state: CallStatus;
  reason: CallEndReason | null;
  version: number;
  media: CallMedia;
  from: PublicProfile;
  to: PublicProfile;
  reached: boolean;
  answeredBy: string | null;
  matchId: string | null;
  reply: string | null;
  expiresAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface CallState extends CallsView {
  friendId: string;
  /** Both allowed: voice calls work. */
  on: boolean;
  /** Both allowed video too: video calls work. */
  video: boolean;
  /** You may ask now (or `askAfter` says when). */
  canAsk: boolean;
  askAfter: string | null;
  /** Why you can't ask yet, if you can't. */
  askBlockedBy: 'messages' | 'wait' | null;
}

const CALL = (id: string) => `call:${id}`;
/** Each person's call that isn't over yet (one at a time). */
const USER = (id: string) => `call:user:${id}`;
/** Calls that aren't over: what the sweep looks at. */
const ACTIVE = 'calls:active';
const LIVE = 'calls:live';
/** A call record is kept a day, so a late question about it still has an answer. */
const CALL_TTL = 86_400;
/** Connecting this long without both media up: failed. */
const CONNECT_MS = 15_000;
/** Out of the app this long while it rings: gone. */
const AWAY_GRACE_MS = 5_000;
/** These endings leave a missed call (a chat line, and the call.missed push). */
const MISSED = new Set<CallEndReason>(['unavailable', 'busy', 'cancelled', 'no_answer', 'gone']);

/**
 * The compare-and-set every move goes through: changes the call only when
 * it's in one of the expected states (comma-separated), bumps its version,
 * keeps its TTL. Returns {1, json} or {0, json-or-empty}.
 */
const MOVE_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0, ''} end
local c = cjson.decode(raw)
local ok = false
for s in string.gmatch(ARGV[1], '[^,]+') do if c.state == s then ok = true end end
if not ok then return {0, raw} end
for k, v in pairs(cjson.decode(ARGV[2])) do c[k] = v end
c.version = (c.version or 0) + 1
local out = cjson.encode(c)
redis.call('SET', KEYS[1], out, 'KEEPTTL')
return {1, out}
`;
const ASKS = (userId: string, day: number) => `callask:${userId}:${day}`;
const WAIT = (friendshipId: string, userId: string) => `callask:wait:${friendshipId}:${userId}`;
const DECLINES = (caller: string, callee: string) => `call:declines:${caller}:${callee}`;
const PAUSE = (caller: string, callee: string) => `call:pause:${caller}:${callee}`;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Someone';
const kindText = (video: boolean) => (video ? 'Video' : 'Voice');
const VIDEO_ASK = (matchId: string) => `call:videoask:${matchId}`;
const minutesText = (s: number) => (s < 60 ? `${Math.max(1, s)} sec` : `${Math.round(s / 60)} min`);

/**
 * Video calls between friends, from a chat. Calls are off in every chat
 * until both people allow them: one asks, the other says yes. Either can
 * turn them off at any time, which turns them off for both. Then a call
 * rings for `callRingSeconds`; picked up, it becomes a normal call (the
 * Video Match screen, WebRTC, reports, gifts) marked as a friend call.
 * Every step leaves a line in the chat. Calls are never recorded.
 */
const CALL_EVENTS = ['call_missed', 'call_declined', 'call_ended'];

export interface CallLogEntry {
  id: string;
  kind: 'missed' | 'declined' | 'ended';
  video: boolean;
  /** How long it lasted (ended calls). */
  seconds: number | null;
  /** You rang (true), they rang (false), or unknown (null). */
  outgoing: boolean | null;
  createdAt: string;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly blocks: BlocksService,
    private readonly matching: MatchingService,
  ) {}

  private get rules() {
    return this.economy.rules;
  }

  private assertOn(): void {
    if (!this.rules.friendCallsEnabled)
      throw new AppError(ErrorCode.CALLS_OFF, 'Calls in chat are off for now', HttpStatus.SERVICE_UNAVAILABLE);
  }

  private async profile(id: string): Promise<PublicProfile> {
    return toPublicProfile(
      await this.prisma.user.findUniqueOrThrow({ where: { id }, include: PROFILE_INCLUDE }),
      this.clock.now(),
    );
  }

  // ── consent ───────────────────────────────────────────────────────────

  async state(me: string, friendId: string): Promise<CallState> {
    const f = await this.friends.requireFriends(me, friendId);
    const v = callsView(f, me);
    const on = v.mine && v.theirs;
    let askBlockedBy: CallState['askBlockedBy'] = null;
    let askAfter: string | null = null;
    if (!on && !v.mine) {
      const ttl = await this.redis.client.pttl(WAIT(f.id, me));
      if (ttl > 0) {
        askBlockedBy = 'wait';
        askAfter = new Date(Date.now() + ttl).toISOString();
      } else if (this.rules.callNeedsMessagesFirst && !v.theirs && !(await this.bothWrote(f.id, me, friendId))) {
        askBlockedBy = 'messages';
      }
    }
    return { friendId, ...v, on, video: on && v.mineVideo && v.theirsVideo, canAsk: !on && !v.mine && !askBlockedBy, askAfter, askBlockedBy };
  }

  private async bothWrote(friendshipId: string, a: string, b: string): Promise<boolean> {
    const senders = await this.prisma.message.findMany({
      where: { friendshipId, kind: { not: 'SYSTEM' }, senderId: { in: [a, b] } },
      distinct: ['senderId'],
      select: { senderId: true },
    });
    return senders.length === 2;
  }

  private async tellConsent(me: string, friendId: string, extra: Record<string, unknown> = {}): Promise<void> {
    const f = await this.friends.requireFriends(me, friendId);
    const mine = callsView(f, me);
    const theirs = callsView(f, friendId);
    this.realtime.toUser(me, ServerEvent.CallConsent, { friendId, ...mine });
    this.realtime.toUser(friendId, ServerEvent.CallConsent, { friendId: me, ...theirs, ...extra });
  }

  private sides(f: { userLowId: string }, userId: string) {
    const low = f.userLowId === userId;
    return { allowed: low ? 'callsLowAllowed' : 'callsHighAllowed', video: low ? 'callsLowVideo' : 'callsHighVideo' } as const;
  }

  private setMine(f: { id: string; userLowId: string }, me: string, allowed: boolean, video: boolean) {
    const s = this.sides(f, me);
    return this.prisma.friendship.update({ where: { id: f.id }, data: { [s.allowed]: allowed, [s.video]: allowed && video } });
  }

  /**
   * Allow calls with a friend: voice only, or voice and video (`video`).
   * If they already allowed, calls are on for both at the lower of the two
   * levels; otherwise this asks them (a card in the chat and a push).
   * Already allowed: changes your level (lowering to voice is instant;
   * raising to video asks them for video too).
   */
  async allow(me: string, friendId: string, video = true): Promise<CallState> {
    this.assertOn();
    const f = await this.friends.requireFriends(me, friendId);
    const v = callsView(f, me);
    const meUser = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, select: { name: true } });
    if (v.mine) {
      if (v.mineVideo === video) return this.state(me, friendId);
      await this.setMine(f, me, true, video);
      if (v.theirs) {
        if (!video && v.theirsVideo)
          await this.messages.system(f.id, me, friendId, 'Video was turned off · voice calls only', { event: 'calls_voice_only' });
        else if (video && v.theirsVideo)
          await this.messages.system(f.id, me, friendId, 'You both allowed voice and video calls', { event: 'calls_on', video: true });
        else if (video)
          await this.messages.system(f.id, me, friendId, `${firstName(meUser.name)} asked to allow video too`, { event: 'calls_asked', video: true });
      }
      await this.tellConsent(me, friendId, video && v.theirs && !v.theirsVideo ? { asked: true, video: true, from: await this.profile(me) } : {});
      return this.state(me, friendId);
    }
    if (v.theirs) {
      // Saying yes to their ask: calls are on, at the lower level.
      await this.setMine(f, me, true, video);
      await this.redis.client.del(WAIT(f.id, me), WAIT(f.id, friendId));
      const both = video && v.theirsVideo;
      await this.messages.system(f.id, me, friendId, both ? 'You both allowed voice and video calls' : 'You both allowed voice calls', { event: 'calls_on', video: both });
      await this.tellConsent(me, friendId);
      return this.state(me, friendId);
    }
    // A new ask: the limits apply.
    const st = await this.state(me, friendId);
    if (st.askBlockedBy === 'messages')
      throw new AppError(
        ErrorCode.CALL_NEEDS_MESSAGES,
        'Say hi first — you both need to have written before asking for calls',
        HttpStatus.FORBIDDEN,
      );
    if (st.askBlockedBy === 'wait')
      throw new AppError(ErrorCode.CALL_ASK_TOO_SOON, 'You can ask again later', HttpStatus.TOO_MANY_REQUESTS, {
        after: st.askAfter,
      });
    const asks = await this.redis.incrWithTtl(ASKS(me, this.clock.dayIndex()), 2 * 86_400);
    if (asks > this.rules.callAsksPerDay) {
      throw new AppError(
        ErrorCode.CALL_ASK_TOO_SOON,
        `That's ${this.rules.callAsksPerDay} asks today. Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
        {
          after: this.clock.dayStart(this.clock.dayIndex() + 1).toISOString(),
        },
      );
    }
    await this.setMine(f, me, true, video);
    await this.messages.system(f.id, me, friendId, `${firstName(meUser.name)} asked to allow ${video ? 'voice and video' : 'voice'} calls`, {
      event: 'calls_asked',
      video,
    });
    await this.tellConsent(me, friendId, { asked: true, video, from: await this.profile(me) });
    return this.state(me, friendId);
  }

  /**
   * Turn video calls off with a friend — for both of you, at once. Taking
   * back your own unanswered ask works the same way (quietly). A call
   * ringing between you stops.
   */
  async turnOff(me: string, friendId: string): Promise<CallState> {
    const f = await this.friends.requireFriends(me, friendId);
    const v = callsView(f, me);
    if (!v.mine && !v.theirs) return this.state(me, friendId);
    await this.prisma.friendship.update({
      where: { id: f.id },
      data: { callsLowAllowed: false, callsHighAllowed: false, callsLowVideo: false, callsHighVideo: false },
    });
    if (v.mine && v.theirs) {
      // The other person waits before asking again; you can ask whenever you like.
      await this.redis.client.set(WAIT(f.id, friendId), '1', 'EX', Math.max(1, this.rules.callAskCooldownHours * 3600));
      await this.messages.system(f.id, me, friendId, 'Calls were turned off', { event: 'calls_off' });
    } else if (v.theirs) {
      // "Not now" to their ask.
      await this.redis.client.set(WAIT(f.id, friendId), '1', 'EX', Math.max(1, this.rules.callAskCooldownHours * 3600));
      await this.messages.system(f.id, me, friendId, 'Not now for calls', { event: 'calls_declined' });
    }
    await this.stopRingingBetween(me, friendId);
    await this.tellConsent(me, friendId);
    return this.state(me, friendId);
  }

  // ── the call: one record, one state machine ─────────────────────────

  private async load(id: string): Promise<CallRecord | null> {
    return this.redis.getJson<CallRecord>(CALL(id));
  }

  /**
   * Moves a call from one of `from` to its next state, atomically (a Lua
   * compare-and-set): of two moves at the same moment only the first wins.
   * Returns the new record, or null when it wasn't in one of `from`.
   */
  private async move(id: string, from: CallStatus[], patch: Partial<CallRecord>): Promise<CallRecord | null> {
    const r = (await this.redis.client.eval(MOVE_LUA, 1, CALL(id), from.join(','), JSON.stringify(patch))) as [number, string];
    if (!r || r[0] !== 1) return null;
    const c = JSON.parse(r[1]) as CallRecord;
    if (c.state === 'ended') await this.cleanup(c);
    await this.emit(c);
    return c;
  }

  /** The snapshot both people's devices draw from. */
  private async snapshot(c: CallRecord): Promise<CallSnapshot> {
    const [from, to] = await Promise.all([this.profile(c.from), this.profile(c.to)]);
    const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
    return {
      callId: c.id,
      state: c.state,
      reason: c.reason,
      version: c.version,
      media: c.video ? 'video' : 'voice',
      from,
      to,
      reached: c.reached,
      answeredBy: c.answeredBy,
      matchId: c.matchId,
      reply: c.reply,
      expiresAt: new Date(c.expiresAt).toISOString(),
      startedAt: iso(c.liveAt),
      endedAt: iso(c.endedAt),
    };
  }

  /** Every move goes to every device of both people: `call:state` with the full snapshot. */
  private async emit(c: CallRecord): Promise<void> {
    this.realtime.toUsers([c.from, c.to], ServerEvent.CallState, await this.snapshot(c));
  }

  private async cleanup(c: CallRecord): Promise<void> {
    const m = this.redis.client.multi().srem(ACTIVE, c.id);
    for (const uid of [c.from, c.to]) m.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, USER(uid), c.id);
    await m.exec();
    // Missed calls: one line in the chat (Call back). The push for it is call.missed (notifications).
    if (c.reason && MISSED.has(c.reason)) {
      await this.messages
        .system(c.friendshipId, c.from, c.to, `Missed ${c.video ? 'video' : 'voice'} call`, { event: 'call_missed', video: c.video })
        .catch(() => undefined);
    }
  }

  /** A participant's view of a call (404 for anyone else). */
  async get(me: string, callId: string): Promise<CallSnapshot> {
    const c = await this.load(callId);
    if (!c || (c.from !== me && c.to !== me)) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    return this.snapshot(c);
  }

  /** Your call right now, if any: what a device redraws from on connect, on returning to the app, and while a call screen is open. */
  async current(me: string): Promise<CallSnapshot | null> {
    const id = await this.redis.client.get(USER(me));
    const c = id ? await this.load(id) : null;
    return c && c.state !== 'ended' ? this.snapshot(c) : null;
  }

  /**
   * Call a friend, voice or video. Both must have allowed it. It rings only
   * if they're in the app right now and free; otherwise it ends at once
   * (`unavailable` / `busy`) and they get a missed call.
   */
  async ring(me: string, friendId: string, media: CallMedia = 'video'): Promise<CallSnapshot> {
    this.assertOn();
    const f = await this.friends.requireFriends(me, friendId);
    if (await this.blocks.eitherBlocked(me, friendId))
      throw new AppError(ErrorCode.BLOCKED, 'Not available', HttpStatus.FORBIDDEN);
    const v = callsView(f, me);
    if (!v.mine || !v.theirs)
      throw new AppError(ErrorCode.CALLS_NOT_ALLOWED, 'You both need to allow calls first', HttpStatus.FORBIDDEN);
    const video = media === 'video';
    if (video && !(v.mineVideo && v.theirsVideo))
      throw new AppError(ErrorCode.CALLS_NOT_ALLOWED, 'Video calls aren’t allowed in this chat — try a voice call', HttpStatus.FORBIDDEN);
    const pauseTtl = await this.redis.client.pttl(PAUSE(me, friendId));
    if (pauseTtl > 0)
      throw new AppError(
        ErrorCode.CALL_PAUSED,
        "They can't take calls from you right now. Try a message.",
        HttpStatus.TOO_MANY_REQUESTS,
        { after: new Date(Date.now() + pauseTtl).toISOString() },
      );
    if ((await this.redis.client.get(USER(me))) || (await this.matching.isInCall(me)))
      throw new AppError(ErrorCode.CALL_BUSY, "You're already in a call", HttpStatus.CONFLICT);

    const now = Date.now();
    const c: CallRecord = {
      id: randomUUID(),
      from: me,
      to: friendId,
      friendshipId: f.id,
      video,
      state: 'ringing',
      reason: null,
      version: 1,
      reached: false,
      answeredBy: null,
      matchId: null,
      reply: null,
      createdAt: now,
      expiresAt: now + this.rules.callRingSeconds * 1000,
      connectingAt: null,
      liveAt: null,
      endedAt: null,
      upFrom: false,
      upTo: false,
      awayAt: null,
    };
    const busy = !!(await this.redis.client.get(USER(friendId))) || !!(await this.matching.isInCall(friendId));
    const away = !busy && !(await this.realtime.isInApp(friendId));
    // Claim both people (NX) so two calls can't ring the same person.
    const claimed = busy || away ? null : await this.redis.client.set(USER(friendId), c.id, 'EX', CALL_TTL, 'NX');
    if (claimed !== 'OK') {
      // Ends before it starts: they're on another call, or not in Vibe right now.
      const ended: CallRecord = { ...c, state: 'ended', reason: busy || !away ? 'busy' : 'unavailable', endedAt: now, version: 2 };
      await this.redis.client.set(CALL(c.id), JSON.stringify(ended), 'EX', CALL_TTL);
      await this.cleanup(ended);
      await this.emit(ended);
      return this.snapshot(ended);
    }
    await this.redis.client.multi().set(USER(me), c.id, 'EX', CALL_TTL).set(CALL(c.id), JSON.stringify(c), 'EX', CALL_TTL).sadd(ACTIVE, c.id).exec();
    await this.emit(c);
    return this.snapshot(c);
  }

  /** Their device is showing the call: the caller's "Calling…" becomes "Ringing…". */
  async reached(me: string, callId: string): Promise<CallSnapshot> {
    const c = await this.load(callId);
    if (!c || c.to !== me) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    if (c.reached || c.state !== 'ringing') return this.snapshot(c);
    return this.snapshot((await this.move(callId, ['ringing'], { reached: true })) ?? (await this.load(callId)) ?? c);
  }

  /**
   * Pick up (the first device wins): `connecting`, and the call starts
   * (`match:found` to both). `voiceOnly` picks up a video call as voice.
   * Too late (it ended, or another device answered): 409 with the snapshot.
   */
  async accept(me: string, callId: string, opts: { voiceOnly?: boolean; deviceId?: string } = {}): Promise<CallSnapshot> {
    const c0 = await this.load(callId);
    if (!c0 || c0.to !== me) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    const video = c0.video && !opts.voiceOnly;
    const c = await this.move(callId, ['ringing'], { state: 'connecting', video, answeredBy: opts.deviceId?.slice(0, 64) || 'device', connectingAt: Date.now() });
    if (!c) throw this.over(await this.load(callId));
    await this.redis.client.del(DECLINES(c.from, c.to));
    const matchId = await this.matching.startFriendCall(c.from, c.to, { voice: !video });
    if (!matchId) {
      await this.move(callId, ['connecting'], { state: 'ended', reason: 'failed', endedAt: Date.now() });
      throw this.over(await this.load(callId));
    }
    await this.redis.client.hset(LIVE, matchId, JSON.stringify({ a: c.from, b: c.to, startedAt: Date.now(), video, callId }));
    return this.snapshot((await this.move(callId, ['connecting'], { matchId })) ?? c);
  }

  /** Not now — optionally with a quick reply (also sent as a chat message). */
  async decline(me: string, callId: string, reply?: string): Promise<CallSnapshot> {
    const c0 = await this.load(callId);
    if (!c0 || c0.to !== me) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    const text = reply?.trim().slice(0, 200) || null;
    const c = await this.move(callId, ['ringing'], { state: 'ended', reason: 'declined', reply: text, endedAt: Date.now() });
    if (!c) return this.snapshot((await this.load(callId)) ?? c0);
    if (text) await this.messages.send(me, c.from, text).catch(() => undefined);
    await this.messages
      .system(c.friendshipId, me, c.from, `${kindText(c.video)} call declined`, { event: 'call_declined', video: c.video })
      .catch(() => undefined);
    const n = await this.redis.incrWithTtl(DECLINES(c.from, c.to), 86_400);
    if (this.rules.callDeclinePause > 0 && n >= this.rules.callDeclinePause) {
      await this.redis.client.multi().set(PAUSE(c.from, c.to), '1', 'EX', 86_400).del(DECLINES(c.from, c.to)).exec();
    }
    return this.snapshot(c);
  }

  /** The caller hangs up: before an answer it's `cancelled` (a missed call for them); while connecting, `hung_up`. */
  async cancel(me: string, callId: string): Promise<CallSnapshot> {
    const c0 = await this.load(callId);
    if (!c0 || c0.from !== me) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    const c =
      (await this.move(callId, ['ringing'], { state: 'ended', reason: 'cancelled', endedAt: Date.now() })) ??
      (await this.move(callId, ['connecting'], { state: 'ended', reason: 'hung_up', endedAt: Date.now() }));
    if (c?.matchId) await this.matching.endByStaff(c.matchId).catch(() => false);
    return this.snapshot(c ?? (await this.load(callId)) ?? c0);
  }

  /** My video or voice is flowing in this call; once both are, it's `live`. */
  async up(me: string, callId: string): Promise<CallSnapshot> {
    const c0 = await this.load(callId);
    if (!c0 || (c0.from !== me && c0.to !== me)) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    const side = c0.from === me ? 'upFrom' : 'upTo';
    if (c0.state !== 'connecting' || c0[side]) return this.snapshot(c0);
    const c = await this.move(callId, ['connecting'], { [side]: true });
    if (c && c.upFrom && c.upTo) return this.snapshot((await this.move(callId, ['connecting'], { state: 'live', liveAt: Date.now() })) ?? c);
    return this.snapshot(c ?? (await this.load(callId)) ?? c0);
  }

  private over(c: CallRecord | null): AppError {
    return new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.CONFLICT, c ? { callId: c.id, state: c.state, reason: c.reason } : undefined);
  }

  private async stopRingingBetween(a: string, b: string): Promise<void> {
    const id = await this.redis.client.get(USER(a));
    const c = id ? await this.load(id) : null;
    if (!c || ![c.from, c.to].includes(b)) return;
    await this.move(c.id, ['ringing'], { state: 'ended', reason: 'turned_off', endedAt: Date.now() });
  }

  /**
   * The server's clocks, every second: ringing past its time → `no_answer`;
   * the person called left the app while it rang (5 s grace) → `gone`;
   * connecting for 15 s without both media up → `failed`; friend calls past
   * the longest allowed length end.
   */
  @Interval(1000)
  async sweep(): Promise<void> {
    await this.redis.withLock('calls-sweep', 5000, async () => {
      const now = Date.now();
      for (const id of await this.redis.client.smembers(ACTIVE)) {
        try {
          const c = await this.load(id);
          if (!c || c.state === 'ended') {
            await this.redis.client.srem(ACTIVE, id);
            continue;
          }
          if (c.state === 'ringing') {
            if (now >= c.expiresAt) {
              await this.move(id, ['ringing'], { state: 'ended', reason: 'no_answer', endedAt: now });
            } else if (!(await this.realtime.isInApp(c.to))) {
              if (!c.awayAt) await this.redis.client.eval(MOVE_LUA, 1, CALL(id), 'ringing', JSON.stringify({ awayAt: now }));
              else if (now - c.awayAt >= AWAY_GRACE_MS) await this.move(id, ['ringing'], { state: 'ended', reason: 'gone', endedAt: now });
            } else if (c.awayAt) {
              await this.redis.client.eval(MOVE_LUA, 1, CALL(id), 'ringing', JSON.stringify({ awayAt: null }));
            }
          } else if (c.state === 'connecting' && c.connectingAt && now - c.connectingAt >= CONNECT_MS) {
            const ended = await this.move(id, ['connecting'], { state: 'ended', reason: 'failed', endedAt: now });
            if (ended?.matchId) await this.matching.endByStaff(ended.matchId).catch(() => false);
          }
        } catch (e) {
          this.logger.warn(`call ${id}: ${(e as Error).message}`);
        }
      }
      const max = this.rules.callMaxMinutes * MS.minute;
      if (max <= 0) return;
      for (const [matchId, raw] of Object.entries(await this.redis.client.hgetall(LIVE))) {
        const live = JSON.parse(raw) as { a: string; b: string; startedAt: number };
        if (now - live.startedAt < max) continue;
        await this.redis.client.hdel(LIVE, matchId);
        await this.matching.endByStaff(matchId).catch(() => false);
      }
    });
  }

  /**
   * Your calls with one friend, newest first, from the call lines in the chat
   * (missed, declined, ended). `outgoing` is null when we can't tell who rang.
   */
  async history(me: string, userId: string): Promise<{ friendSince: string | null; streak: number; calls: CallLogEntry[] }> {
    const f = await this.prisma.friendship.findUnique({ where: this.friends.pairWhere(me, userId) });
    if (!f || f.status !== FriendshipStatus.ACCEPTED) throw AppError.notFound('Friend');
    const rows = await this.prisma.message.findMany({
      // (Not a prefix match: Postgres LIKE reads `_` as any letter, so `call_` would catch `calls_on`.)
      where: { friendshipId: f.id, kind: MessageKind.SYSTEM, OR: CALL_EVENTS.map((e) => ({ meta: { path: ['event'], equals: e } })) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const calls = rows.map((m): CallLogEntry => {
      const meta = (m.meta ?? {}) as { event?: string; video?: boolean; seconds?: number };
      const kind = meta.event === 'call_missed' ? 'missed' : meta.event === 'call_declined' ? 'declined' : 'ended';
      // Missed: the sender rang. Declined: the sender is who said no, so the other one rang.
      const outgoing = kind === 'missed' ? m.senderId === me : kind === 'declined' ? m.senderId !== me : null;
      return { id: m.id, kind, video: meta.video !== false, seconds: kind === 'ended' ? Number(meta.seconds ?? 0) : null, outgoing, createdAt: m.createdAt.toISOString() };
    });
    return { friendSince: f.acceptedAt?.toISOString() ?? null, streak: f.streakCount, calls };
  }

  /** A friend call ended: a line in the chat with how long it was. */
  @OnEvent(MATCH_ENDED, { async: true })
  async onCallEnded(e: MatchEndedEvent): Promise<void> {
    if (!e.friendCall) return;
    try {
      const raw = await this.redis.client.hget(LIVE, e.matchId);
      await this.redis.client.multi().hdel(LIVE, e.matchId).del(VIDEO_ASK(e.matchId)).exec();
      // The call record ends too: hung up, or dropped when a connection was lost.
      const callId = raw ? (JSON.parse(raw) as { callId?: string }).callId : undefined;
      if (callId) await this.move(callId, ['connecting', 'live'], { state: 'ended', reason: e.reason === 'disconnected' ? 'dropped' : 'hung_up', endedAt: Date.now() });
      const video = raw ? (JSON.parse(raw) as { video?: boolean }).video !== false : !e.voiceCall;
      const f = await this.prisma.friendship.findUnique({ where: this.friends.pairWhere(e.a, e.b) });
      if (!f) return;
      await this.messages.system(f.id, e.a, e.b, `${kindText(video)} call · ${minutesText(e.durationSeconds)}`, {
        event: 'call_ended',
        seconds: e.durationSeconds,
        video,
      });
    } catch (err) {
      this.logger.warn(`call log for ${e.matchId} failed: ${(err as Error).message}`);
    }
  }

  /** Blocking turns calls off and stops any ringing between the two. */
  @OnEvent(USER_BLOCKED, { async: true })
  async onBlocked(e: UserBlockedEvent): Promise<void> {
    await this.prisma.friendship
      .updateMany({
        where: this.pairFields(e.blockerId, e.blockedId),
        data: { callsLowAllowed: false, callsHighAllowed: false, callsLowVideo: false, callsHighVideo: false },
      })
      .catch(() => undefined);
    await this.stopRingingBetween(e.blockerId, e.blockedId).catch(() => undefined);
  }

  // ── voice → video during a call ───────────────────────────────────────

  /**
   * In a voice call: ask to turn on video ("ask"), or answer it ("yes" /
   * "no"). Only between friends who both allow video. A yes turns the call
   * into a video call for both (`call:video` { matchId, state: "on" }); the
   * cameras open on each side then.
   */
  async video(me: string, matchId: string, action: 'ask' | 'yes' | 'no' | 'off'): Promise<{ state: 'asked' | 'on' | 'declined' | 'off' }> {
    const raw = await this.redis.client.hget(LIVE, matchId);
    const live = raw ? (JSON.parse(raw) as { a: string; b: string; startedAt: number; video?: boolean }) : null;
    if (!live || ![live.a, live.b].includes(me)) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    const other = live.a === me ? live.b : live.a;
    // "Switch to voice only": either side, no ask; both cameras turn off.
    if (action === 'off') {
      if (live.video !== false) {
        await this.redis.client.hset(LIVE, matchId, JSON.stringify({ ...live, video: false }));
        await this.redis.client.del(VIDEO_ASK(matchId));
        for (const uid of [live.a, live.b]) this.realtime.toUser(uid, ServerEvent.CallVideo, { matchId, state: 'off', from: me });
      }
      return { state: 'off' };
    }
    if (live.video) return { state: 'on' };
    const f = await this.friends.requireFriends(me, other);
    const v = callsView(f, me);
    if (!(v.mineVideo && v.theirsVideo))
      throw new AppError(ErrorCode.CALLS_NOT_ALLOWED, 'You both need to allow video in this chat first', HttpStatus.FORBIDDEN);
    if (action === 'ask') {
      await this.redis.client.set(VIDEO_ASK(matchId), me, 'EX', 60);
      this.realtime.toUser(other, ServerEvent.CallVideo, { matchId, state: 'asked', from: me });
      return { state: 'asked' };
    }
    const asker = await this.redis.client.get(VIDEO_ASK(matchId));
    if (!asker || asker === me) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'Nothing to answer', HttpStatus.CONFLICT);
    await this.redis.client.del(VIDEO_ASK(matchId));
    if (action === 'no') {
      this.realtime.toUser(asker, ServerEvent.CallVideo, { matchId, state: 'declined' });
      return { state: 'declined' };
    }
    await this.redis.client.hset(LIVE, matchId, JSON.stringify({ ...live, video: true }));
    for (const uid of [live.a, live.b]) this.realtime.toUser(uid, ServerEvent.CallVideo, { matchId, state: 'on' });
    return { state: 'on' };
  }

  private pairFields(a: string, b: string) {
    const [low, high] = a < b ? [a, b] : [b, a];
    return { userLowId: low, userHighId: high };
  }
}
