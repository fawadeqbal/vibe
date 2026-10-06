import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { LedgerKind, MatchEndReason, ReportReason } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { SOCKET_DISCONNECTED, SocketLifecycleEvent } from '../../infra/realtime/realtime.gateway';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { EconomyService } from '../catalog/economy.service';
import { EngagementService } from '../engagement/engagement.service';
import { ProgressService } from '../engagement/progress.service';
import { ModerationService, USER_BANNED, UserBannedEvent } from '../moderation/moderation.service';
import { BlocksService, USER_BLOCKED, UserBlockedEvent } from '../social/blocks.service';
import { FriendsService } from '../social/friends.service';
import { StreakService } from '../social/streak.service';
import { isProfileReady } from '../users/profile.rules';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import { isBoosted, isVip } from '../wallet/wallet.mapper';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../settings/settings.service';
import { MatchGamesService } from './match-games.service';
import { MatchQueueService } from './match-queue.service';
import { callSignal, freeReconnectUntil, GOOD_CALL_SECONDS, isFreeReconnect, isNightCall, VIBE_SCORE_ALPHA } from './match-rules';
import { MatchSessionStore } from './match-session.store';
import { ActiveMatch, EndedReason, MatchPrefs, Ticket } from './matching.types';
import { SkipCooldownService } from './skip-cooldown.service';

export interface MatchFoundPayload {
  matchId: string;
  partner: PublicProfile;
  /** The caller creates the WebRTC offer; the callee answers. */
  role: 'caller' | 'callee';
  blur: boolean;
  sharedInterests: string[];
  coinsSpent: number;
  reconnect: boolean;
}

export const MATCH_STARTED = 'match.started';
export const MATCH_ENDED = 'match.ended';
/** MATCH_ENDED payload: the pair, plus how the call went. */
export interface MatchEndedEvent extends MatchStartedEvent {
  durationSeconds: number;
  reason: keyof typeof END_REASON_DB;
  byUserId: string;
  mutualLike: boolean;
}
export const MATCH_ACTION = 'match.action';
export interface MatchStartedEvent {
  matchId: string;
  a: string;
  b: string;
}
export interface MatchActionEvent {
  matchId: string;
  from: string;
  to: string;
  action: 'chat' | 'gift' | 'friend';
  text?: string;
}

/** What `match:ended` tells each person. */
export interface MatchEndedPayload {
  matchId: string;
  reason: EndedReason;
  byMe: boolean;
  durationSeconds: number;
  liked: boolean;
  likedMe: boolean;
  /** Both liked each other ("You liked each other 💞"). */
  mutualLike: boolean;
  giftsReceived: number;
  giftsSent: number;
  /** Coin price of `match:reconnect` once the free window (if any) is over. */
  reconnectCost: number;
  /** Reconnect is free until then (dropped call or mutual like); null = not free. */
  freeReconnectUntil: string | null;
}

const END_REASON_DB: Record<'skipped' | 'stopped' | 'reported' | 'blocked' | 'disconnected' | 'banned', MatchEndReason> = {
  skipped: MatchEndReason.SKIPPED,
  stopped: MatchEndReason.STOPPED,
  reported: MatchEndReason.REPORTED,
  blocked: MatchEndReason.BLOCKED,
  disconnected: MatchEndReason.DISCONNECTED,
  banned: MatchEndReason.REPORTED,
};

/**
 * The match loop, server side: join the queue → paired → talk (likes, chat,
 * gifts, friend requests, WebRTC signalling relayed) → next / end. All state
 * lives in Redis and Postgres, so any instance can serve any user; events
 * reach the right socket through the Redis adapter.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: MatchQueueService,
    private readonly sessions: MatchSessionStore,
    private readonly cooldown: SkipCooldownService,
    private readonly wallet: WalletService,
    private readonly blocks: BlocksService,
    private readonly friends: FriendsService,
    private readonly moderation: ModerationService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly events: EventEmitter2,
    private readonly settings: SettingsService,
    private readonly economy: EconomyService,
    private readonly engagement: EngagementService,
    private readonly progress: ProgressService,
    private readonly streaks: StreakService,
    private readonly games: MatchGamesService,
  ) {}

  // ── queue ─────────────────────────────────────────────────────────────

  async join(userId: string, prefs: MatchPrefs): Promise<{ status: 'searching' | 'matched'; cost: number; position: number }> {
    if (!(await this.settings.get('matching.enabled'))) {
      throw new AppError(ErrorCode.MATCHING_PAUSED, 'Matching is paused for a moment. Try again soon.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.moderation.assertNotBanned(userId);
    const current = await this.sessions.forUser(userId);
    if (current) await this.endMatch(current, userId, 'stopped');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || user.status !== 'ACTIVE') throw AppError.notFound('User');
    if (!isProfileReady(user)) throw new AppError(ErrorCode.PROFILE_INCOMPLETE, 'Add your name and age first', HttpStatus.FORBIDDEN);
    const now = this.clock.now();
    const vip = isVip(user.wallet, now);
    // Vibe Hour: filters are free for everyone.
    const cost = this.engagement.isVibeHour(now) ? 0 : this.economy.filterCost({ gender: prefs.gender, countryCode: prefs.countryCode }, vip);
    if (cost > (user.wallet?.coins ?? 0)) throw AppError.insufficientCoins(cost, user.wallet?.coins ?? 0);

    const last = await this.sessions.lastPartner(userId);
    const exclude = [...(await this.blocks.excluded(userId))];
    if (last) exclude.push(last);
    const ticket: Ticket = {
      userId,
      gender: user.gender,
      countryCode: user.countryCode,
      verified: user.verified,
      prefs,
      cost,
      vip,
      boosted: isBoosted(user.wallet, now),
      enqueuedAt: now.getTime(),
      exclude,
      interests: user.interests,
      vibeScore: user.vibeScore,
    };
    await this.sessions.savePrefs(userId, prefs);
    await this.queue.enqueue(ticket);
    this.realtime.toUser(userId, ServerEvent.MatchSearching, { cost, boosted: ticket.boosted });
    const matched = await this.tryMatch(userId);
    return { status: matched ? 'matched' : 'searching', cost, position: matched ? 0 : await this.queue.size() };
  }

  async leave(userId: string): Promise<void> {
    await this.queue.remove(userId);
  }

  /** Tries to pair one waiting user. Safe to call from anywhere, any time. */
  async tryMatch(userId: string): Promise<boolean> {
    const pair = await this.queue.claimPartner(userId);
    if (!pair) return false;
    const { me, partner } = pair;
    // Oldest waiter is the caller: they have had their camera ready longest.
    const [a, b] = me.enqueuedAt <= partner.enqueuedAt ? [me, partner] : [partner, me];
    await this.connect(a, b, false);
    return true;
  }

  /** Starts a call between two tickets already taken out of the queue. */
  async connect(a: Ticket, b: Ticket, reconnect: boolean): Promise<void> {
    const match = await this.prisma.match.create({ data: { userAId: a.userId, userBId: b.userId, reconnect } });
    // Charge paid filters now that there is someone to talk to.
    const charged: string[] = [];
    for (const t of [a, b]) {
      if (t.cost <= 0) continue;
      try {
        await this.wallet.spend(t.userId, t.cost, `Filters · ${filterLabel(t.prefs)}`, { idempotencyKey: `match:${match.id}`, reference: match.id });
        charged.push(t.userId);
      } catch (e) {
        await this.abortPairing(match.id, t, t === a ? b : a, e);
        if (charged.length) this.wallet.changed(charged);
        return;
      }
    }
    await this.prisma.match.update({ where: { id: match.id }, data: { coinsSpentA: a.cost, coinsSpentB: b.cost } });
    await this.prisma.user.updateMany({ where: { id: { in: [a.userId, b.userId] } }, data: { matchesCount: { increment: 1 } } });
    await this.sessions.start({ id: match.id, a: a.userId, b: b.userId, startedAt: Date.now() });
    if (charged.length) this.wallet.changed(charged);

    const users = await this.prisma.user.findMany({ where: { id: { in: [a.userId, b.userId] } }, include: PROFILE_INCLUDE });
    const byId = new Map(users.map((u) => [u.id, u]));
    const ua = byId.get(a.userId)!;
    const ub = byId.get(b.userId)!;
    const shared = ua.interests.filter((i) => ub.interests.includes(i));
    const now = this.clock.now();
    const payload = (me: Ticket, other: typeof ua, role: 'caller' | 'callee'): MatchFoundPayload => ({
      matchId: match.id,
      partner: toPublicProfile(other, now),
      role,
      blur: me.prefs.autoBlur,
      sharedInterests: shared,
      coinsSpent: me.cost,
      reconnect,
    });
    this.realtime.toUser(a.userId, ServerEvent.MatchFound, payload(a, ub, 'caller'));
    this.realtime.toUser(b.userId, ServerEvent.MatchFound, payload(b, ua, 'callee'));
    this.events.emit(MATCH_STARTED, { matchId: match.id, a: a.userId, b: b.userId } satisfies MatchStartedEvent);
  }

  /** One side could not pay: refund nothing (nobody was charged twice), requeue the other. */
  private async abortPairing(matchId: string, failed: Ticket, other: Ticket, err: unknown): Promise<void> {
    await this.prisma.match.delete({ where: { id: matchId } }).catch(() => undefined);
    const otherCharge = await this.prisma.ledgerEntry.findFirst({ where: { userId: other.userId, idempotencyKey: `match:${matchId}` } });
    if (otherCharge) {
      await this.wallet.earn(other.userId, -otherCharge.coins, 'Filters refunded', { idempotencyKey: `match-refund:${matchId}`, kind: LedgerKind.REFUND });
    }
    await this.queue.enqueue(other, other.enqueuedAt);
    const body = err instanceof AppError ? err.toJSON() : { code: ErrorCode.INTERNAL, message: 'Could not start the match' };
    this.realtime.toUser(failed.userId, ServerEvent.MatchError, body);
    void this.tryMatch(other.userId);
  }

  /** Waiting users whose match did not appear on join get retried here. */
  @Interval(1000)
  async sweep(): Promise<void> {
    await this.redis.withLock('match-sweep', this.config.get('MATCH_SWEEP_MS') * 5, async () => {
      for (const id of await this.queue.head(50)) {
        if (await this.queue.isQueued(id)) await this.tryMatch(id).catch((e) => this.logger.warn(`sweep ${id}: ${e.message}`));
      }
    });
  }

  // ── in a call ─────────────────────────────────────────────────────────

  private async requireMatch(userId: string): Promise<{ m: ActiveMatch; partnerId: string }> {
    const m = await this.sessions.forUser(userId);
    if (!m) throw new AppError(ErrorCode.NOT_IN_MATCH, 'You are not in a call', HttpStatus.CONFLICT);
    return { m, partnerId: m.a === userId ? m.b : m.a };
  }

  /** Skip to the next person (with the quick-skip cooldown), then search again. */
  async next(userId: string, payToBypass = false) {
    const m = await this.sessions.forUser(userId);
    if (m) {
      const left = await this.cooldown.secondsLeft(userId);
      if (left > 0) {
        if (!payToBypass) throw new AppError(ErrorCode.SKIP_COOLDOWN, `Wait ${left}s or skip for ${this.economy.rules.skipCooldownBypassCost} coins`, HttpStatus.TOO_MANY_REQUESTS, { seconds: left, bypassCost: this.economy.rules.skipCooldownBypassCost });
        await this.wallet.spend(userId, this.economy.rules.skipCooldownBypassCost, 'Skip cooldown bypass');
        this.wallet.changed([userId]);
        await this.cooldown.clear(userId);
      }
      await this.endMatch(m, userId, 'skipped');
      await this.cooldown.noteSkip(userId, (Date.now() - m.startedAt) / 1000);
    }
    const prefs = (await this.sessions.prefs(userId)) ?? { gender: 'ANYONE', countryCode: null, safeMode: false, autoBlur: true };
    return this.join(userId, prefs);
  }

  async end(userId: string): Promise<void> {
    await this.queue.remove(userId);
    const m = await this.sessions.forUser(userId);
    if (m) await this.endMatch(m, userId, 'stopped');
  }

  /** Like the partner; if they already liked you in this call, both get `match:mutual`. */
  async like(userId: string): Promise<{ mutual: boolean }> {
    const { m, partnerId } = await this.requireMatch(userId);
    const created = await this.prisma.matchLike.createMany({ data: [{ matchId: m.id, fromId: userId, toId: partnerId }], skipDuplicates: true });
    if (!created.count) return { mutual: !!(await this.prisma.matchLike.findUnique({ where: { matchId_fromId: { matchId: m.id, fromId: partnerId } } })) };
    await this.prisma.user.update({ where: { id: partnerId }, data: { likesCount: { increment: 1 } } });
    this.realtime.toUser(partnerId, ServerEvent.MatchLiked, { matchId: m.id });
    await this.progress.award(partnerId, this.economy.rules.xpPerLikeReceived, 'like');
    const mutual = !!(await this.prisma.matchLike.findUnique({ where: { matchId_fromId: { matchId: m.id, fromId: partnerId } } }));
    if (mutual) {
      this.realtime.toUser(userId, ServerEvent.MatchMutual, { matchId: m.id });
      this.realtime.toUser(partnerId, ServerEvent.MatchMutual, { matchId: m.id });
    }
    return { mutual };
  }

  async chat(userId: string, text: string): Promise<{ at: string }> {
    const { m, partnerId } = await this.requireMatch(userId);
    if ((await this.redis.incrWithTtl(`mchat:${userId}`, 10)) > 15) throw new AppError(ErrorCode.RATE_LIMITED, 'Slow down a little', HttpStatus.TOO_MANY_REQUESTS);
    const at = this.clock.now().toISOString();
    // In-call chat is relayed, not stored.
    this.realtime.toUser(partnerId, ServerEvent.MatchChat, { matchId: m.id, text: text.trim().slice(0, 500), at });
    this.events.emit(MATCH_ACTION, { matchId: m.id, from: userId, to: partnerId, action: 'chat', text } satisfies MatchActionEvent);
    return { at };
  }

  async gift(userId: string, giftId: string, idempotencyKey?: string) {
    const gift = this.economy.findGift(giftId);
    if (!gift) throw AppError.notFound('Gift');
    const { m, partnerId } = await this.requireMatch(userId);
    const names = await this.prisma.user.findMany({ where: { id: { in: [userId, partnerId] } }, select: { id: true, name: true } });
    const name = (id: string) => names.find((n) => n.id === id)?.name || 'someone';
    const sent = await this.wallet.sendGift(userId, partnerId, gift, { fromName: name(userId), toName: name(partnerId), matchId: m.id, idempotencyKey });
    const payload = { matchId: m.id, gift: { ...gift, gems: this.economy.gemsFor(gift) }, bonusGems: sent.bonusGems };
    this.realtime.toUser(partnerId, ServerEvent.MatchGift, { ...payload, fromMe: false });
    this.events.emit(MATCH_ACTION, { matchId: m.id, from: userId, to: partnerId, action: 'gift', text: gift.name } satisfies MatchActionEvent);
    return { ...payload, fromMe: true };
  }

  async addFriend(userId: string) {
    const { m, partnerId } = await this.requireMatch(userId);
    const r = await this.friends.request(userId, partnerId, { viaCall: true });
    if (r.state === 'requested') this.realtime.toUser(partnerId, ServerEvent.MatchFriendRequest, { matchId: m.id });
    this.events.emit(MATCH_ACTION, { matchId: m.id, from: userId, to: partnerId, action: 'friend' } satisfies MatchActionEvent);
    return r;
  }

  async report(userId: string, input: { reason: ReportReason; note?: string; block?: boolean }) {
    const { m, partnerId } = await this.requireMatch(userId);
    await this.endMatch(m, userId, 'reported');
    return this.moderation.report(userId, { userId: partnerId, matchId: m.id, reason: input.reason, note: input.note, block: input.block });
  }

  /**
   * Call the last person again, if they are online and free. Paid, except
   * within `freeReconnectMinutes` of a dropped call or a mutual like.
   */
  async reconnect(userId: string) {
    await this.moderation.assertNotBanned(userId);
    const partnerId = await this.sessions.lastPartner(userId);
    if (!partnerId) throw new AppError(ErrorCode.PARTNER_UNAVAILABLE, 'Nobody to reconnect with', HttpStatus.CONFLICT);
    const partnerIsBot = (await this.prisma.user.findUnique({ where: { id: partnerId }, select: { isBot: true } }))?.isBot ?? false;
    if ((await this.sessions.forUser(partnerId)) || !(partnerIsBot || (await this.realtime.isOnline(partnerId))) || (await this.blocks.eitherBlocked(userId, partnerId))) {
      throw new AppError(ErrorCode.PARTNER_UNAVAILABLE, "They're not available right now", HttpStatus.CONFLICT);
    }
    const free = isFreeReconnect(await this.freeReconnectWith(userId, partnerId), this.clock.now());
    const cost = free ? 0 : this.economy.rules.reconnectCost;
    await this.queue.remove(userId);
    await this.queue.remove(partnerId);
    if (cost > 0) {
      await this.wallet.spend(userId, cost, 'Reconnect');
      this.wallet.changed([userId]);
    }
    const users = await this.prisma.user.findMany({ where: { id: { in: [userId, partnerId] } }, include: { wallet: true } });
    const now = this.clock.now();
    const prefs = (await this.sessions.prefs(userId)) ?? { gender: 'ANYONE' as const, countryCode: null, safeMode: false, autoBlur: true };
    const ticketOf = (id: string, p: MatchPrefs): Ticket => {
      const u = users.find((x) => x.id === id)!;
      return { userId: id, gender: u.gender, countryCode: u.countryCode, verified: u.verified, prefs: p, cost: 0, vip: isVip(u.wallet, now), boosted: false, enqueuedAt: Date.now(), exclude: [], interests: u.interests, vibeScore: u.vibeScore };
    };
    const partnerPrefs = (await this.sessions.prefs(partnerId)) ?? prefs;
    await this.connect(ticketOf(userId, prefs), ticketOf(partnerId, partnerPrefs), true);
    return { reconnected: true, paidCoins: cost };
  }

  /** When reconnecting with `partnerId` stops being free (null = not free), from your last call together. */
  private async freeReconnectWith(userId: string, partnerId: string): Promise<Date | null> {
    const last = await this.prisma.match.findFirst({
      where: { OR: [{ userAId: userId, userBId: partnerId }, { userAId: partnerId, userBId: userId }], endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      include: { likes: { select: { fromId: true } } },
    });
    if (!last) return null;
    return freeReconnectUntil({ endedAt: last.endedAt, endReason: last.endReason, mutualLike: new Set(last.likes.map((l) => l.fromId)).size === 2 }, this.economy.rules.freeReconnectMinutes);
  }

  /** WebRTC offer/answer/ICE — relayed verbatim to the partner. */
  async signal(userId: string, payload: { type: string; data?: unknown }) {
    const { m, partnerId } = await this.requireMatch(userId);
    this.realtime.toUser(partnerId, ServerEvent.RtcSignal, { matchId: m.id, type: payload.type, data: payload.data });
  }

  /** The live call a user is in, if any (admin panel). */
  async isInCall(userId: string): Promise<{ matchId: string; partnerId: string; startedAt: string } | null> {
    const m = await this.sessions.forUser(userId);
    return m ? { matchId: m.id, partnerId: m.a === userId ? m.b : m.a, startedAt: new Date(m.startedAt).toISOString() } : null;
  }

  /** Staff hang-up of a live call (both people are told the call ended). */
  async endByStaff(matchId: string): Promise<boolean> {
    const m = await this.sessions.get(matchId);
    if (!m) return false;
    await this.endMatch(m, m.a, 'stopped');
    return true;
  }

  async onlineCount(): Promise<{ online: number; searching: number }> {
    return { online: await this.realtime.onlineCount(), searching: await this.queue.size() };
  }

  // ── ending ────────────────────────────────────────────────────────────

  /**
   * Ends a match once, records it, and tells both people — each from their
   * own point of view ("you skipped" vs "they left").
   */
  async endMatch(m: ActiveMatch, byUserId: string, reason: keyof typeof END_REASON_DB): Promise<void> {
    const finished = await this.sessions.finish(m.id);
    if (!finished) return;
    const ended = await this.prisma.match.update({
      where: { id: m.id },
      data: { endedAt: this.clock.now(), endReason: END_REASON_DB[reason], endedById: byUserId },
      include: { likes: true, gifts: { select: { fromId: true, toId: true } } },
    });
    const durationSeconds = Math.max(0, Math.round((ended.endedAt!.getTime() - ended.startedAt.getTime()) / 1000));
    const mutualLike = new Set(ended.likes.map((l) => l.fromId)).size === 2;
    const freeUntil = freeReconnectUntil({ endedAt: ended.endedAt, endReason: ended.endReason, mutualLike }, this.economy.rules.freeReconnectMinutes);
    for (const uid of [m.a, m.b]) {
      const mine = uid === byUserId;
      // The other person only ever hears that their partner left.
      const theirReason: EndedReason = mine ? reason : 'partner_left';
      this.realtime.toUser(uid, ServerEvent.MatchEnded, {
        matchId: m.id,
        reason: theirReason,
        byMe: mine,
        durationSeconds,
        liked: ended.likes.some((l) => l.fromId === uid),
        likedMe: ended.likes.some((l) => l.toId === uid),
        mutualLike,
        giftsReceived: ended.gifts.filter((g) => g.toId === uid).length,
        giftsSent: ended.gifts.filter((g) => g.fromId === uid).length,
        reconnectCost: this.economy.rules.reconnectCost,
        freeReconnectUntil: freeUntil?.toISOString() ?? null,
      } satisfies MatchEndedPayload);
    }
    await this.games.clear(m.id).catch(() => undefined);
    await this.afterCall({ matchId: m.id, a: m.a, b: m.b, durationSeconds, reason, byUserId, mutualLike }, ended.startedAt, ended.likes);
    this.events.emit(MATCH_ENDED, { matchId: m.id, a: m.a, b: m.b, durationSeconds, reason, byUserId, mutualLike } satisfies MatchEndedEvent);
  }

  /**
   * Engagement bookkeeping once a call is over: good calls (≥ 60 s) give XP,
   * count toward badges and keep friend streaks alive; every call nudges
   * both people's vibe score. Never fails the hang-up.
   */
  private async afterCall(e: MatchEndedEvent, startedAt: Date, likes: { fromId: string; toId: string }[]): Promise<void> {
    try {
      if (e.durationSeconds >= GOOD_CALL_SECONDS) {
        const night = isNightCall(this.clock.minuteOfDay(startedAt));
        await this.prisma.user.updateMany({ where: { id: { in: [e.a, e.b] } }, data: { goodCallsCount: { increment: 1 }, ...(night ? { nightCallsCount: { increment: 1 } } : {}) } });
        for (const id of [e.a, e.b]) await this.progress.award(id, this.economy.rules.xpPerGoodCall, 'good-call');
        await this.streaks.noteCall(e.a, e.b);
      }
      for (const [me, other] of [
        [e.a, e.b],
        [e.b, e.a],
      ]) {
        const signal = callSignal({
          durationSeconds: e.durationSeconds,
          likedByPartner: likes.some((l) => l.fromId === other),
          reportedByPartner: e.reason === 'reported' && e.byUserId === other,
          skippedByPartner: e.reason === 'skipped' && e.byUserId === other,
        });
        if (signal !== null) await this.prisma.$executeRaw`UPDATE "User" SET "vibeScore" = "vibeScore" + ${VIBE_SCORE_ALPHA} * (${signal} - "vibeScore") WHERE "id" = ${me}`;
      }
    } catch (err) {
      this.logger.warn(`after-call bookkeeping for ${e.matchId} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(SOCKET_DISCONNECTED, { async: true })
  async onDisconnect(e: SocketLifecycleEvent): Promise<void> {
    if (!e.lastSocket) return;
    try {
      await this.queue.remove(e.userId);
      const m = await this.sessions.forUser(e.userId);
      if (m) await this.endMatch(m, e.userId, 'disconnected');
    } catch (err) {
      this.logger.warn(`cleanup after disconnect failed for ${e.userId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(USER_BANNED, { async: true })
  async onBanned(e: UserBannedEvent): Promise<void> {
    await this.queue.remove(e.userId);
    const m = await this.sessions.forUser(e.userId);
    if (m) await this.endMatch(m, e.userId, 'banned');
  }

  @OnEvent(USER_BLOCKED, { async: true })
  async onBlocked(e: UserBlockedEvent): Promise<void> {
    const m = await this.sessions.forUser(e.blockerId);
    if (m && (m.a === e.blockedId || m.b === e.blockedId)) await this.endMatch(m, e.blockerId, 'blocked');
  }
}

function filterLabel(p: MatchPrefs): string {
  return [p.gender === 'WOMEN' ? 'women' : p.gender === 'MEN' ? 'men' : null, p.countryCode].filter(Boolean).join(' · ') || 'filters';
}
