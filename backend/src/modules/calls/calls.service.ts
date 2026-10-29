import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';

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

/** A call that is ringing. */
export interface RingingCall {
  id: string;
  from: string;
  to: string;
  friendshipId: string;
  expiresAt: number;
  /** A video call (else voice only). */
  video: boolean;
}

export type CallMedia = 'voice' | 'video';

export type CallEndReason = 'declined' | 'no_answer' | 'cancelled' | 'accepted' | 'turned_off';

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
const USER = (id: string) => `call:user:${id}`;
const RINGING = 'calls:ringing';
const LIVE = 'calls:live';
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
    await this.stopRingingBetween(me, friendId, 'turned_off');
    await this.tellConsent(me, friendId);
    return this.state(me, friendId);
  }

  // ── ringing ───────────────────────────────────────────────────────────

  private async ringing(id: string): Promise<RingingCall | null> {
    return this.redis.getJson<RingingCall>(CALL(id));
  }

  /** The call ringing for you right now, if any (an app opening from a push). */
  async incoming(me: string): Promise<{ callId: string; from: PublicProfile; expiresAt: string; media: CallMedia } | null> {
    const id = await this.redis.client.get(USER(me));
    const c = id ? await this.ringing(id) : null;
    if (!c || c.to !== me || c.expiresAt < Date.now()) return null;
    return { callId: c.id, from: await this.profile(c.from), expiresAt: new Date(c.expiresAt).toISOString(), media: c.video ? 'video' : 'voice' };
  }

  /** Ring a friend, voice or video. Both must have allowed it; neither may be busy. */
  async ring(me: string, friendId: string, media: CallMedia = 'video'): Promise<{ callId: string; to: PublicProfile; expiresAt: string; media: CallMedia }> {
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
    if (
      (await this.redis.client.get(USER(me))) ||
      (await this.redis.client.get(USER(friendId))) ||
      (await this.matching.isInCall(friendId))
    ) {
      throw new AppError(ErrorCode.CALL_BUSY, 'In another call right now', HttpStatus.CONFLICT);
    }
    const ringMs = this.rules.callRingSeconds * 1000;
    const call: RingingCall = {
      id: randomUUID(),
      from: me,
      to: friendId,
      friendshipId: f.id,
      expiresAt: Date.now() + ringMs,
      video,
    };
    const ttl = Math.ceil(ringMs / 1000) + 30;
    // Claim both people (NX) so two calls can't ring the same person.
    const claimed = await this.redis.client.set(USER(friendId), call.id, 'EX', ttl, 'NX');
    if (claimed !== 'OK') throw new AppError(ErrorCode.CALL_BUSY, 'In another call right now', HttpStatus.CONFLICT);
    await this.redis.client
      .multi()
      .set(USER(me), call.id, 'EX', ttl)
      .set(CALL(call.id), JSON.stringify(call), 'EX', ttl)
      .zadd(RINGING, call.expiresAt, call.id)
      .exec();
    const [from, to] = await Promise.all([this.profile(me), this.profile(friendId)]);
    const expiresAt = new Date(call.expiresAt).toISOString();
    this.realtime.toUser(friendId, ServerEvent.CallIncoming, { callId: call.id, from, expiresAt, media });
    this.realtime.toUser(me, ServerEvent.CallRinging, { callId: call.id, to, expiresAt, media });
    return { callId: call.id, to, expiresAt, media };
  }

  /** Stops a ringing call exactly once; returns it (null if already over). */
  private async finish(id: string): Promise<RingingCall | null> {
    const removed = await this.redis.client.zrem(RINGING, id);
    const c = await this.ringing(id);
    if (!removed || !c) return null;
    await this.redis.client.del(CALL(id));
    for (const uid of [c.from, c.to]) {
      if ((await this.redis.client.get(USER(uid))) === id) await this.redis.client.del(USER(uid));
    }
    return c;
  }

  private async mine(id: string, me: string, side: 'from' | 'to'): Promise<RingingCall> {
    const c = await this.ringing(id);
    if (!c || c[side] !== me) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    return c;
  }

  /** Pick up: the call starts (`match:found` to both, marked as a friend call). */
  async accept(me: string, callId: string): Promise<{ matchId: string | null }> {
    await this.mine(callId, me, 'to');
    const c = await this.finish(callId);
    if (!c) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    await this.redis.client.del(DECLINES(c.from, c.to));
    this.realtime.toUser(c.from, ServerEvent.CallEnded, { callId, reason: 'accepted' });
    const matchId = await this.matching.startFriendCall(c.from, c.to, { voice: !c.video });
    if (matchId)
      await this.redis.client.hset(LIVE, matchId, JSON.stringify({ a: c.from, b: c.to, startedAt: Date.now(), video: c.video }));
    return { matchId };
  }

  /** Not now — optionally with a quick reply sent as a chat message. */
  async decline(me: string, callId: string, reply?: string): Promise<void> {
    await this.mine(callId, me, 'to');
    const c = await this.finish(callId);
    if (!c) return;
    this.realtime.toUser(c.from, ServerEvent.CallEnded, { callId, reason: 'declined', reply: reply ?? null });
    if (reply?.trim()) await this.messages.send(me, c.from, reply.trim().slice(0, 200)).catch(() => undefined);
    await this.messages
      .system(c.friendshipId, me, c.from, `${kindText(c.video)} call declined`, { event: 'call_declined', video: c.video })
      .catch(() => undefined);
    const n = await this.redis.incrWithTtl(DECLINES(c.from, c.to), 86_400);
    if (this.rules.callDeclinePause > 0 && n >= this.rules.callDeclinePause) {
      await this.redis.client.multi().set(PAUSE(c.from, c.to), '1', 'EX', 86_400).del(DECLINES(c.from, c.to)).exec();
    }
  }

  /** The caller hangs up before an answer: a missed call for them. */
  async cancel(me: string, callId: string): Promise<void> {
    await this.mine(callId, me, 'from');
    const c = await this.finish(callId);
    if (c) await this.missed(c, 'cancelled');
  }

  private async missed(c: RingingCall, reason: 'cancelled' | 'no_answer'): Promise<void> {
    const from = await this.profile(c.from);
    this.realtime.toUser(c.to, ServerEvent.CallEnded, { callId: c.id, reason, from });
    this.realtime.toUser(c.from, ServerEvent.CallEnded, { callId: c.id, reason });
    await this.messages
      .system(c.friendshipId, c.from, c.to, `Missed ${c.video ? 'video' : 'voice'} call`, { event: 'call_missed', video: c.video })
      .catch(() => undefined);
  }

  private async stopRingingBetween(a: string, b: string, reason: CallEndReason): Promise<void> {
    const id = await this.redis.client.get(USER(a));
    const c = id ? await this.ringing(id) : null;
    if (!c || ![c.from, c.to].includes(b)) return;
    if (await this.finish(c.id))
      for (const uid of [c.from, c.to]) this.realtime.toUser(uid, ServerEvent.CallEnded, { callId: c.id, reason });
  }

  /** Unanswered calls ring out; friend calls past the longest allowed length end. */
  @Interval(1000)
  async sweep(): Promise<void> {
    await this.redis.withLock('calls-sweep', 5000, async () => {
      for (const id of await this.redis.client.zrangebyscore(RINGING, 0, Date.now(), 'LIMIT', 0, 50)) {
        const c = await this.finish(id);
        if (c)
          await this.missed(c, 'no_answer').catch((e) =>
            this.logger.warn(`missed call ${id}: ${(e as Error).message}`),
          );
      }
      const max = this.rules.callMaxMinutes * MS.minute;
      if (max <= 0) return;
      for (const [matchId, raw] of Object.entries(await this.redis.client.hgetall(LIVE))) {
        const live = JSON.parse(raw) as { a: string; b: string; startedAt: number };
        if (Date.now() - live.startedAt < max) continue;
        await this.redis.client.hdel(LIVE, matchId);
        await this.matching.endByStaff(matchId).catch(() => false);
      }
    });
  }

  /** A friend call ended: a line in the chat with how long it was. */
  @OnEvent(MATCH_ENDED, { async: true })
  async onCallEnded(e: MatchEndedEvent): Promise<void> {
    if (!e.friendCall) return;
    try {
      const raw = await this.redis.client.hget(LIVE, e.matchId);
      await this.redis.client.multi().hdel(LIVE, e.matchId).del(VIDEO_ASK(e.matchId)).exec();
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
    await this.stopRingingBetween(e.blockerId, e.blockedId, 'turned_off').catch(() => undefined);
  }

  // ── voice → video during a call ───────────────────────────────────────

  /**
   * In a voice call: ask to turn on video ("ask"), or answer it ("yes" /
   * "no"). Only between friends who both allow video. A yes turns the call
   * into a video call for both (`call:video` { matchId, state: "on" }); the
   * cameras open on each side then.
   */
  async video(me: string, matchId: string, action: 'ask' | 'yes' | 'no'): Promise<{ state: 'asked' | 'on' | 'declined' }> {
    const raw = await this.redis.client.hget(LIVE, matchId);
    const live = raw ? (JSON.parse(raw) as { a: string; b: string; startedAt: number; video?: boolean }) : null;
    if (!live || ![live.a, live.b].includes(me)) throw new AppError(ErrorCode.CALL_NOT_FOUND, 'That call is over', HttpStatus.NOT_FOUND);
    const other = live.a === me ? live.b : live.a;
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
