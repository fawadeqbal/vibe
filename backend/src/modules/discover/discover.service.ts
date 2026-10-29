import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, SwipeKind, UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { BlocksService } from '../social/blocks.service';
import { FriendsService, FriendView } from '../social/friends.service';
import { MessagesService } from '../social/messages.service';
import { isProfileReady } from '../users/profile.rules';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import { isBoosted, isVip } from '../wallet/wallet.mapper';
import { WalletService } from '../wallet/wallet.service';
import { EngagementService } from '../engagement/engagement.service';
import { rankCards, type RankInput } from './discover.rank';

export type SwipeKindView = 'like' | 'super' | 'pass';
export type WantedGender = 'anyone' | 'women' | 'men';

export interface DeckQuery {
  gender?: WantedGender;
  minAge?: number;
  maxAge?: number;
  countryCode?: string;
  onlineOnly?: boolean;
  verifiedOnly?: boolean;
  limit?: number;
}

/** Who may use the extra filters (gender, country, online now, verified) and why. */
export interface DiscoverFiltersView {
  /** Extra filters usable right now. */
  unlocked: boolean;
  /** Why: everyone (rule off), VIP, Vibe Hour, or a pass bought until `passUntil`. */
  reason: 'free' | 'vip' | 'vibe_hour' | 'pass' | null;
  passUntil: string | null;
  passCost: number;
  passHours: number;
}

export interface DiscoverCard {
  profile: PublicProfile;
  online: boolean;
  lastSeenAt: string | null;
  /** They Super Liked you: shown with a star, first in the deck. */
  superLikedMe: boolean;
  sharedInterests: string[];
}

export interface DiscoverStatus {
  enabled: boolean;
  vip: boolean;
  /** Likes you can still give today; null = unlimited (VIP). */
  likesLeft: number | null;
  freeLikesPerDay: number;
  /** When the free likes come back (business midnight). */
  resetsAt: string;
  /** Free Super Likes left today (VIP); others pay `superLikeCost`. */
  freeSuperLikesLeft: number;
  superLikeCost: number;
  /** 0 for VIP. */
  undoCost: number;
  packSize: number;
  packCost: number;
  /** You appear in other people's decks (a photo, and "Show me in Discover" on). */
  visible: boolean;
  showInDiscover: boolean;
  hasPhoto: boolean;
  likedYou: { count: number; unseen: number };
  filters: DiscoverFiltersView;
}

export interface SwipeResult {
  matched: boolean;
  /** The new friend, when it's a match. */
  friend: FriendView | null;
  coinsSpent: number;
  status: DiscoverStatus;
}

const LIKES = [SwipeKind.LIKE, SwipeKind.SUPER];
/** Only a pass this recent can be undone. */
const UNDO_WINDOW = MS.hour;
/** Candidates read per deck request (ranked in memory, then cut to the page). */
const CANDIDATES = 300;
const extraKey = (userId: string, day: number) => `discover:extra:${userId}:${day}`;
const passKey = (userId: string) => `discover:fpass:${userId}`;

/** The filters that need VIP, Vibe Hour or a pass (age is always free). */
export const usesExtraFilters = (q: DeckQuery): boolean =>
  (!!q.gender && q.gender !== 'anyone') || !!q.countryCode || !!q.onlineOnly || !!q.verifiedOnly;

/**
 * Discover: a deck of real people, one at a time. Like or pass; two likes
 * make a match — they become friends and the chat opens with "You matched
 * in Discover". Free likes per day, Super Likes, Undo and more likes for
 * coins; VIP likes without limit. Every number is an economy rule, editable
 * in the admin panel. No bots, no private or hidden accounts, nobody
 * blocked either way, nobody you are already connected with.
 */
@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly wallet: WalletService,
    private readonly blocks: BlocksService,
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly engagement: EngagementService,
  ) {}

  private get rules() {
    return this.economy.rules;
  }

  private assertOn(): void {
    if (!this.rules.discoverEnabled)
      throw new AppError(ErrorCode.DISCOVER_OFF, 'Discover is off for now', HttpStatus.SERVICE_UNAVAILABLE);
  }

  /** Who may appear in anyone's deck (before per-viewer exclusions). */
  private visibleWhere(now: Date): Prisma.UserWhereInput {
    return {
      isBot: false,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      privateAccount: false,
      showInDiscover: true,
      avatarUrl: { not: '' },
      onboardedAt: { not: null },
      age: { gte: Math.max(18, this.rules.minAge) },
      lastSeenAt: { gte: new Date(now.getTime() - this.rules.discoverActiveDays * MS.day) },
      OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }],
      ...(this.rules.discoverVerifiedOnly ? { verified: true } : {}),
    };
  }

  // ── the deck ──────────────────────────────────────────────────────────

  async deck(me: string, q: DeckQuery = {}): Promise<{ items: DiscoverCard[] }> {
    this.assertOn();
    const now = this.clock.now();
    const meUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: { countryCode: true, interests: true },
    });
    if (usesExtraFilters(q)) {
      const f = await this.filtersFor(me, now);
      if (!f.unlocked)
        throw new AppError(ErrorCode.FILTERS_LOCKED, 'These filters need VIP or a filter pass', HttpStatus.PAYMENT_REQUIRED, {
          passCost: f.passCost,
          passHours: f.passHours,
        });
    }
    const exclude = [me, ...(await this.blocks.excluded(me)), ...(await this.friends.connectedIds(me))];
    const passCutoff = new Date(now.getTime() - this.rules.discoverPassResetDays * MS.day);
    const minAge = Math.max(18, q.minAge ?? 18);
    const maxAge = Math.max(minAge, q.maxAge ?? 99);
    const candidates = await this.prisma.user.findMany({
      where: {
        AND: [
          this.visibleWhere(now),
          { id: { notIn: exclude } },
          { age: { gte: minAge, lte: maxAge } },
          q.gender === 'women' ? { gender: 'FEMALE' } : q.gender === 'men' ? { gender: 'MALE' } : {},
          q.countryCode ? { countryCode: q.countryCode } : {},
          q.verifiedOnly ? { verified: true } : {},
          // Not swiped yet — a pass comes back after a while.
          {
            swipesGot: {
              none: { fromId: me, OR: [{ kind: { not: SwipeKind.PASS } }, { createdAt: { gte: passCutoff } }] },
            },
          },
        ],
      },
      orderBy: { lastSeenAt: 'desc' },
      take: CANDIDATES,
      include: { wallet: { select: { vipUntil: true, boostUntil: true } } },
    });
    if (!candidates.length) return { items: [] };
    const allIds = candidates.map((c) => c.id);
    const online = await this.realtime.onlineMap(allIds);
    const pool = q.onlineOnly ? candidates.filter((c) => online[c.id]) : candidates;
    if (!pool.length) return { items: [] };
    const ids = pool.map((c) => c.id);
    const [theirLikes] = await Promise.all([
      this.prisma.discoverSwipe.findMany({
        where: { fromId: { in: ids }, toId: me, kind: { in: LIKES } },
        select: { fromId: true, kind: true },
      }),
    ]);
    const likedMe = new Map(theirLikes.map((l) => [l.fromId, l.kind]));
    const inputs: RankInput[] = pool.map((u) => ({
      id: u.id,
      superLikedMe: likedMe.get(u.id) === SwipeKind.SUPER,
      likedMe: likedMe.get(u.id) === SwipeKind.LIKE,
      boosted: isBoosted(u.wallet, now),
      sameCountry: u.countryCode === meUser.countryCode,
      online: !!online[u.id],
      lastSeenAt: u.lastSeenAt?.getTime() ?? 0,
    }));
    const order = rankCards(inputs, Math.min(Math.max(q.limit ?? 20, 1), 50));
    const byId = new Map(pool.map((u) => [u.id, u]));
    return {
      items: order.map((id) => {
        const u = byId.get(id)!;
        return {
          profile: toPublicProfile(u, now),
          online: !!online[id],
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
          superLikedMe: likedMe.get(id) === SwipeKind.SUPER,
          sharedInterests: u.interests.filter((i) => meUser.interests.includes(i)),
        };
      }),
    };
  }

  // ── counters ──────────────────────────────────────────────────────────

  private async usage(me: string, now: Date) {
    const dayStart = this.clock.startOfDay(now);
    const [likes, supers, extra] = await Promise.all([
      this.prisma.discoverSwipe.count({ where: { fromId: me, kind: SwipeKind.LIKE, createdAt: { gte: dayStart } } }),
      this.prisma.discoverSwipe.count({ where: { fromId: me, kind: SwipeKind.SUPER, createdAt: { gte: dayStart } } }),
      this.redis.client.get(extraKey(me, this.clock.dayIndex(now))),
    ]);
    return { likes, supers, extra: Number(extra ?? 0) };
  }

  async status(me: string): Promise<DiscoverStatus> {
    const now = this.clock.now();
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: me },
      include: { wallet: { select: { vipUntil: true } } },
    });
    const vip = isVip(u.wallet, now);
    const used = await this.usage(me, now);
    const liked = await this.likedYouCounts(me);
    const r = this.rules;
    const hasPhoto = !!u.avatarUrl;
    return {
      enabled: !!r.discoverEnabled,
      vip,
      likesLeft: vip ? null : Math.max(0, r.discoverFreeLikesPerDay + used.extra - used.likes),
      freeLikesPerDay: r.discoverFreeLikesPerDay,
      resetsAt: this.clock.dayStart(this.clock.dayIndex(now) + 1).toISOString(),
      freeSuperLikesLeft: vip ? Math.max(0, r.discoverVipFreeSuperLikes - used.supers) : 0,
      superLikeCost: r.discoverSuperLikeCost,
      undoCost: vip ? 0 : r.discoverUndoCost,
      packSize: r.discoverLikePackSize,
      packCost: r.discoverLikePackCost,
      visible: hasPhoto && u.showInDiscover && !u.privateAccount,
      showInDiscover: u.showInDiscover,
      hasPhoto,
      likedYou: liked,
      filters: await this.filtersFor(me, now, vip),
    };
  }

  /** Whether the extra filters are open for this person right now. */
  private async filtersFor(me: string, now: Date, vip?: boolean): Promise<DiscoverFiltersView> {
    const r = this.rules;
    const base = { passCost: r.discoverFilterPassCost, passHours: r.discoverFilterPassHours };
    const until = Number((await this.redis.client.get(passKey(me))) ?? 0);
    const passUntil = until > now.getTime() ? new Date(until).toISOString() : null;
    if (!r.discoverPremiumFilters) return { ...base, unlocked: true, reason: 'free', passUntil };
    if (vip === undefined) {
      const w = await this.prisma.wallet.findUnique({ where: { userId: me }, select: { vipUntil: true } });
      vip = isVip(w, now);
    }
    if (vip) return { ...base, unlocked: true, reason: 'vip', passUntil };
    if (passUntil) return { ...base, unlocked: true, reason: 'pass', passUntil };
    if (this.engagement.isVibeHour(now)) return { ...base, unlocked: true, reason: 'vibe_hour', passUntil };
    return { ...base, unlocked: false, reason: null, passUntil: null };
  }

  /** A filter pass: the extra filters for `discoverFilterPassHours`. Nothing is charged when they're already open. */
  async buyFilterPass(me: string): Promise<DiscoverStatus> {
    this.assertOn();
    const now = this.clock.now();
    const f = await this.filtersFor(me, now);
    if (f.unlocked && f.reason !== 'vibe_hour') return this.status(me);
    const until = now.getTime() + this.rules.discoverFilterPassHours * MS.hour;
    await this.wallet.spend(me, this.rules.discoverFilterPassCost, 'Discover filter pass', {
      idempotencyKey: `fpass:${me}:${Math.floor(now.getTime() / MS.minute)}`,
    });
    this.wallet.changed([me]);
    await this.redis.client.set(passKey(me), String(until), 'PX', until - now.getTime());
    return this.status(me);
  }

  // ── swiping ───────────────────────────────────────────────────────────

  async swipe(me: string, targetId: string, kindView: SwipeKindView): Promise<SwipeResult> {
    this.assertOn();
    if (targetId === me) throw new AppError(ErrorCode.VALIDATION_FAILED, "That's you", HttpStatus.BAD_REQUEST);
    const now = this.clock.now();
    const meUser = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, include: PROFILE_INCLUDE });
    if (!isProfileReady(meUser))
      throw new AppError(ErrorCode.PROFILE_INCOMPLETE, 'Add your name and age first', HttpStatus.FORBIDDEN);
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, status: UserStatus.ACTIVE, isBot: false, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw AppError.notFound('User');
    if (await this.blocks.eitherBlocked(me, targetId))
      throw new AppError(ErrorCode.BLOCKED, 'Not available', HttpStatus.FORBIDDEN);

    const kind = kindView === 'super' ? SwipeKind.SUPER : kindView === 'like' ? SwipeKind.LIKE : SwipeKind.PASS;
    const existing = await this.prisma.discoverSwipe.findUnique({
      where: { fromId_toId: { fromId: me, toId: targetId } },
    });
    // The same swipe again (double tap, retry): nothing changes, nothing is charged.
    if (existing && (existing.kind === kind || (existing.kind !== SwipeKind.PASS && kind !== SwipeKind.SUPER))) {
      return { matched: false, friend: null, coinsSpent: 0, status: await this.status(me) };
    }

    const vip = isVip(meUser.wallet, now);
    let coinsSpent = 0;
    if (kind !== SwipeKind.PASS) {
      const lastHour = await this.prisma.discoverSwipe.count({
        where: { fromId: me, kind: { in: LIKES }, createdAt: { gte: new Date(now.getTime() - MS.hour) } },
      });
      if (lastHour >= this.rules.discoverMaxLikesPerHour)
        throw new AppError(
          ErrorCode.RATE_LIMITED,
          'Slow down a little — try again in a while',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const used = await this.usage(me, now);
      if (kind === SwipeKind.LIKE && !vip && used.likes >= this.rules.discoverFreeLikesPerDay + used.extra) {
        throw new AppError(ErrorCode.OUT_OF_LIKES, "You're out of likes for today", HttpStatus.TOO_MANY_REQUESTS, {
          resetsAt: this.clock.dayStart(this.clock.dayIndex(now) + 1).toISOString(),
          packSize: this.rules.discoverLikePackSize,
          packCost: this.rules.discoverLikePackCost,
        });
      }
      if (kind === SwipeKind.SUPER && !(vip && used.supers < this.rules.discoverVipFreeSuperLikes)) {
        coinsSpent = this.rules.discoverSuperLikeCost;
      }
    }

    // Charge and record together: no coins without the swipe, no free Super Like on a failed charge.
    await this.prisma.tx(async (tx) => {
      if (coinsSpent > 0)
        await this.wallet.spend(me, coinsSpent, 'Super Like', {
          tx,
          idempotencyKey: `super:${me}:${targetId}:${this.clock.dayIndex(now)}`,
        });
      await tx.discoverSwipe.upsert({
        where: { fromId_toId: { fromId: me, toId: targetId } },
        create: { fromId: me, toId: targetId, kind },
        update: { kind, createdAt: now, seenAt: null },
      });
    });
    if (coinsSpent > 0) this.wallet.changed([me]);

    let matched = false;
    let friend: FriendView | null = null;
    if (kind !== SwipeKind.PASS) {
      const theirs = await this.prisma.discoverSwipe.findUnique({
        where: { fromId_toId: { fromId: targetId, toId: me } },
      });
      if (theirs && theirs.kind !== SwipeKind.PASS) {
        friend = await this.match(me, targetId);
        matched = !!friend;
      } else {
        await this.tellLiked(targetId, kind === SwipeKind.SUPER ? toPublicProfile(meUser, now) : null);
      }
    }
    return { matched, friend, coinsSpent, status: await this.status(me) };
  }

  /** Two likes: friends now, a "You matched" line in the chat, and both are told. */
  private async match(me: string, other: string): Promise<FriendView | null> {
    const { friendship, created } = await this.friends.connectMatched(me, other);
    if (created)
      await this.messages.system(friendship.id, me, other, 'You matched in Discover', {
        event: 'matched',
        via: 'discover',
      });
    // Both like-rows are now "seen": a match is not a pending like any more.
    await this.prisma.discoverSwipe.updateMany({
      where: {
        OR: [
          { fromId: me, toId: other },
          { fromId: other, toId: me },
        ],
        seenAt: null,
      },
      data: { seenAt: this.clock.now() },
    });
    const [mine, theirs] = await Promise.all([this.friends.view(me, other), this.friends.view(other, me)]);
    if (theirs) this.realtime.toUser(other, ServerEvent.DiscoverMatch, { friend: theirs });
    if (mine) this.realtime.toUser(me, ServerEvent.DiscoverMatch, { friend: mine });
    return mine ?? null;
  }

  private async tellLiked(toId: string, superFrom: PublicProfile | null): Promise<void> {
    try {
      const { unseen } = await this.likedYouCounts(toId);
      this.realtime.toUser(toId, ServerEvent.DiscoverLiked, { superLike: !!superFrom, from: superFrom, unseen });
    } catch (e) {
      this.logger.warn(`liked notice to ${toId} failed: ${(e as Error).message}`);
    }
  }

  /** Bring back the last person you passed (within the hour). Free for VIP. */
  async undo(me: string): Promise<{ card: DiscoverCard; coinsSpent: number; status: DiscoverStatus }> {
    this.assertOn();
    const now = this.clock.now();
    const last = await this.prisma.discoverSwipe.findFirst({
      where: { fromId: me },
      orderBy: { createdAt: 'desc' },
      include: { to: { include: PROFILE_INCLUDE } },
    });
    if (!last || last.kind !== SwipeKind.PASS || now.getTime() - last.createdAt.getTime() > UNDO_WINDOW) {
      throw new AppError(ErrorCode.NOTHING_TO_UNDO, 'Nothing to undo', HttpStatus.CONFLICT);
    }
    const vip = await this.wallet.isVip(me);
    const cost = vip ? 0 : this.rules.discoverUndoCost;
    await this.prisma.tx(async (tx) => {
      if (cost > 0) await this.wallet.spend(me, cost, 'Undo in Discover', { tx, idempotencyKey: `undo:${last.id}` });
      await tx.discoverSwipe.delete({ where: { id: last.id } });
    });
    if (cost > 0) this.wallet.changed([me]);
    const meUser = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, select: { interests: true } });
    const superLikedMe = !!(await this.prisma.discoverSwipe.findFirst({
      where: { fromId: last.toId, toId: me, kind: SwipeKind.SUPER },
    }));
    const card: DiscoverCard = {
      profile: toPublicProfile(last.to, now),
      online: await this.realtime.isOnline(last.toId),
      lastSeenAt: last.to.lastSeenAt?.toISOString() ?? null,
      superLikedMe,
      sharedInterests: last.to.interests.filter((i) => meUser.interests.includes(i)),
    };
    return { card, coinsSpent: cost, status: await this.status(me) };
  }

  /** More likes for today, for coins. */
  async buyLikes(me: string): Promise<DiscoverStatus> {
    this.assertOn();
    const now = this.clock.now();
    const day = this.clock.dayIndex(now);
    const n = await this.redis.client.incr(`discover:packs:${me}:${day}`);
    await this.redis.client.expire(`discover:packs:${me}:${day}`, 2 * 86_400);
    await this.wallet.spend(me, this.rules.discoverLikePackCost, `${this.rules.discoverLikePackSize} more likes`, {
      idempotencyKey: `likes:${me}:${day}:${n}`,
    });
    this.wallet.changed([me]);
    await this.redis.client
      .multi()
      .incrby(extraKey(me, day), this.rules.discoverLikePackSize)
      .expire(extraKey(me, day), 2 * 86_400)
      .exec();
    return this.status(me);
  }

  async setVisible(me: string, visible: boolean): Promise<DiscoverStatus> {
    await this.prisma.user.update({ where: { id: me }, data: { showInDiscover: visible } });
    return this.status(me);
  }

  // ── liked you ─────────────────────────────────────────────────────────

  /** Likes waiting for an answer: from visible people you haven't swiped and aren't connected with. */
  private async pendingLikesWhere(me: string): Promise<Prisma.DiscoverSwipeWhereInput> {
    const now = this.clock.now();
    const exclude = [...(await this.blocks.excluded(me)), ...(await this.friends.connectedIds(me))];
    return {
      toId: me,
      kind: { in: LIKES },
      fromId: { notIn: exclude },
      from: { ...this.visibleWhere(now), swipesGot: { none: { fromId: me } } },
    };
  }

  async likedYouCounts(me: string): Promise<{ count: number; unseen: number }> {
    const where = await this.pendingLikesWhere(me);
    const [count, unseen] = await Promise.all([
      this.prisma.discoverSwipe.count({ where }),
      this.prisma.discoverSwipe.count({ where: { ...where, seenAt: null } }),
    ]);
    return { count, unseen };
  }

  /** "Liked you": VIP sees who; everyone else sees how many and a few faces to blur. */
  async likedYou(
    me: string,
  ): Promise<{ count: number; unseen: number; unlocked: boolean; people: DiscoverCard[]; previews: string[] }> {
    const now = this.clock.now();
    const where = await this.pendingLikesWhere(me);
    const rows = await this.prisma.discoverSwipe.findMany({
      where,
      orderBy: [{ kind: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: { from: { include: PROFILE_INCLUDE } },
    });
    const unseen = rows.filter((r) => !r.seenAt).length;
    const vip = await this.wallet.isVip(me);
    const meUser = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, select: { interests: true } });
    const online = vip ? await this.realtime.onlineMap(rows.map((r) => r.fromId)) : {};
    return {
      count: rows.length,
      unseen,
      unlocked: vip,
      people: vip
        ? rows.map((r) => ({
            profile: toPublicProfile(r.from, now),
            online: !!online[r.fromId],
            lastSeenAt: r.from.lastSeenAt?.toISOString() ?? null,
            superLikedMe: r.kind === SwipeKind.SUPER,
            sharedInterests: r.from.interests.filter((i) => meUser.interests.includes(i)),
          }))
        : [],
      previews: rows.slice(0, 4).map((r) => r.from.avatarUrl),
    };
  }

  async markLikesSeen(me: string): Promise<void> {
    await this.prisma.discoverSwipe.updateMany({
      where: { toId: me, seenAt: null, kind: { in: LIKES } },
      data: { seenAt: this.clock.now() },
    });
  }
}
