import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FollowStatus, Prisma, UserStatus } from '@prisma/client';

import { cursorArgs, CursorQueryDto, Page, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { PRIVACY_OPENED, PrivacyOpenedEvent } from '../users/profile.rules';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import { BlocksService, USER_BLOCKED, UserBlockedEvent } from './blocks.service';
import { haveMet } from './met';

export type FollowState = 'none' | 'requested' | 'following';
export type FollowList = 'followers' | 'following' | 'requests';

export interface FollowEntry {
  profile: PublicProfile;
  /** When the follow (or the request) was made. */
  since: string;
  /** Followers: you follow them too. Following: they follow you. Requests: always false. */
  followsBack: boolean;
}

const pair = (followerId: string, followeeId: string) => ({ followerId_followeeId: { followerId, followeeId } });

/**
 * One-way follows. Free; a private account approves each request. The
 * counters on User only count ACTIVE follows and move in the same
 * transaction as the row. Following never unlocks chat (Friendship does).
 */
@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly redis: RedisService,
    private readonly economy: EconomyService,
  ) {}

  async state(me: string, other: string): Promise<FollowState> {
    const f = await this.prisma.follow.findUnique({ where: pair(me, other), select: { status: true } });
    if (!f) return 'none';
    return f.status === FollowStatus.ACTIVE ? 'following' : 'requested';
  }

  async follow(me: string, targetId: string): Promise<{ state: Exclude<FollowState, 'none'> }> {
    if (me === targetId) throw AppError.forbidden("That's you");
    if (await this.blocks.eitherBlocked(me, targetId)) throw new AppError(ErrorCode.BLOCKED, 'Not available', HttpStatus.FORBIDDEN);
    const existing = await this.state(me, targetId);
    if (existing !== 'none') return { state: existing };
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { status: true, privateAccount: true } });
    if (!target || target.status !== UserStatus.ACTIVE) throw AppError.notFound('User');
    if (!(await haveMet(this.prisma, me, targetId))) throw new AppError(ErrorCode.NEVER_MATCHED, 'You can follow people you have met in a match', HttpStatus.FORBIDDEN);
    await this.countToday(me);
    const active = !target.privateAccount;
    try {
      await this.prisma.tx(async (tx) => {
        await tx.follow.create({ data: { followerId: me, followeeId: targetId, status: active ? FollowStatus.ACTIVE : FollowStatus.PENDING, acceptedAt: active ? this.clock.now() : null } });
        if (active) await this.bump(tx, me, targetId, 1);
      });
    } catch (e) {
      // Two taps at once: the other request created the row first.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { state: (await this.state(me, targetId)) as Exclude<FollowState, 'none'> };
      throw e;
    }
    this.realtime.toUser(targetId, active ? ServerEvent.FollowNew : ServerEvent.FollowRequest, { from: await this.publicProfile(me) });
    return { state: active ? 'following' : 'requested' };
  }

  /** Unfollow, or take back a pending request. */
  async unfollow(me: string, targetId: string): Promise<void> {
    if (await this.removeEdge(me, targetId)) this.realtime.toUser(targetId, ServerEvent.FollowRemoved, { userId: me });
  }

  async accept(me: string, followerId: string): Promise<void> {
    const ok = await this.prisma.tx((tx) => this.activate(tx, followerId, me));
    if (!ok) throw AppError.notFound('Follow request');
    this.realtime.toUser(followerId, ServerEvent.FollowAccepted, { by: await this.publicProfile(me) });
  }

  async decline(me: string, followerId: string): Promise<void> {
    await this.prisma.follow.deleteMany({ where: { followerId, followeeId: me, status: FollowStatus.PENDING } });
  }

  async removeFollower(me: string, followerId: string): Promise<void> {
    if (await this.removeEdge(followerId, me)) this.realtime.toUser(followerId, ServerEvent.FollowRemoved, { userId: me });
  }

  /** Your own lists only — other people's lists are never exposed. */
  async list(me: string, which: FollowList, q: CursorQueryDto): Promise<Page<FollowEntry>> {
    const iFollow = which === 'following';
    const where: Prisma.FollowWhereInput = iFollow
      ? { followerId: me, status: FollowStatus.ACTIVE, followee: { status: UserStatus.ACTIVE } }
      : { followeeId: me, status: which === 'requests' ? FollowStatus.PENDING : FollowStatus.ACTIVE, follower: { status: UserStatus.ACTIVE } };
    const rows = await this.prisma.follow.findMany({
      where,
      include: { follower: { include: PROFILE_INCLUDE }, followee: { include: PROFILE_INCLUDE } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(q),
    });
    const otherIds = rows.map((r) => (iFollow ? r.followeeId : r.followerId));
    const back =
      which === 'requests' || !otherIds.length
        ? []
        : await this.prisma.follow.findMany({
            where: iFollow ? { followerId: { in: otherIds }, followeeId: me, status: FollowStatus.ACTIVE } : { followerId: me, followeeId: { in: otherIds }, status: FollowStatus.ACTIVE },
            select: { followerId: true, followeeId: true },
          });
    const backIds = new Set(back.map((b) => (iFollow ? b.followerId : b.followeeId)));
    const now = this.clock.now();
    return toPage(rows, q.limit, (r) => {
      const other = iFollow ? r.followee : r.follower;
      return { profile: toPublicProfile(other, now), since: r.createdAt.toISOString(), followsBack: backIds.has(other.id) };
    });
  }

  @OnEvent(PRIVACY_OPENED, { async: true, promisify: true })
  async onPrivacyOpened(e: PrivacyOpenedEvent): Promise<void> {
    await this.acceptAll(e.userId);
  }

  /** Accepts every waiting request (the account went public). */
  async acceptAll(me: string): Promise<number> {
    const pending = await this.prisma.follow.findMany({ where: { followeeId: me, status: FollowStatus.PENDING }, select: { followerId: true } });
    if (!pending.length) return 0;
    const accepted = await this.prisma.tx(async (tx) => {
      const ids: string[] = [];
      for (const { followerId } of pending) if (await this.activate(tx, followerId, me)) ids.push(followerId);
      return ids;
    });
    if (accepted.length) this.realtime.toUsers(accepted, ServerEvent.FollowAccepted, { by: await this.publicProfile(me) });
    return accepted.length;
  }

  @OnEvent(USER_BLOCKED, { async: true })
  async onBlocked(e: UserBlockedEvent): Promise<void> {
    await this.removeEdge(e.blockerId, e.blockedId);
    await this.removeEdge(e.blockedId, e.blockerId);
  }

  // ── helpers (also used by the listeners) ───────────────────────────────

  /** Spam guard: at most `maxFollowsPerDay` new follows per business day. */
  private async countToday(me: string): Promise<void> {
    const max = this.economy.rules.maxFollowsPerDay;
    const n = await this.redis.incrWithTtl(`follows:day:${me}:${this.clock.dayOf().getTime()}`, 2 * 86_400);
    if (n > max) throw new AppError(ErrorCode.FOLLOW_LIMIT, `You can follow up to ${max} people a day`, HttpStatus.TOO_MANY_REQUESTS, { max });
  }

  /** PENDING → ACTIVE for follower→followee, with counters. False when nothing was pending. */
  async activate(tx: Tx, followerId: string, followeeId: string): Promise<boolean> {
    const { count } = await tx.follow.updateMany({ where: { followerId, followeeId, status: FollowStatus.PENDING }, data: { status: FollowStatus.ACTIVE, acceptedAt: this.clock.now() } });
    if (count) await this.bump(tx, followerId, followeeId, 1);
    return count > 0;
  }

  /** Deletes follower→followee and fixes the counters. True when a row was removed. */
  removeEdge(followerId: string, followeeId: string): Promise<boolean> {
    return this.prisma.tx(async (tx) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const row = await tx.follow.findUnique({ where: pair(followerId, followeeId), select: { id: true, status: true } });
        if (!row) return false;
        // Delete only if the status is still what we read, so counters stay right if it was accepted meanwhile.
        const { count } = await tx.follow.deleteMany({ where: { id: row.id, status: row.status } });
        if (!count) continue;
        if (row.status === FollowStatus.ACTIVE) await this.bump(tx, followerId, followeeId, -1);
        return true;
      }
      return false;
    });
  }

  async publicProfile(id: string): Promise<PublicProfile> {
    return toPublicProfile(await this.prisma.user.findUniqueOrThrow({ where: { id }, include: PROFILE_INCLUDE }), this.clock.now());
  }

  private async bump(tx: Tx, followerId: string, followeeId: string, by: 1 | -1): Promise<void> {
    await tx.user.update({ where: { id: followerId }, data: { followingCount: { increment: by } } });
    await tx.user.update({ where: { id: followeeId }, data: { followersCount: { increment: by } } });
  }
}
