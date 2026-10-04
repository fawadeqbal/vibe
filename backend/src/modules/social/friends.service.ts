import { HttpStatus, Injectable } from '@nestjs/common';
import { FriendshipStatus, Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { orderedPair } from '../../common/utils/text';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import { RewardsService } from '../wallet/rewards.service';
import { WalletService } from '../wallet/wallet.service';
import { BlocksService } from './blocks.service';

export type FriendState = 'friends' | 'requested' | 'incoming';

export interface FriendView {
  profile: PublicProfile;
  state: FriendState;
  since: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  online: boolean;
}

/**
 * Friend requests and the friend list. One Friendship row per pair; a
 * request to someone who already asked you accepts it.
 */
@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly rewards: RewardsService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  pairWhere(a: string, b: string): Prisma.FriendshipWhereUniqueInput {
    const [low, high] = orderedPair(a, b);
    return { userLowId_userHighId: { userLowId: low, userHighId: high } };
  }

  /** The accepted friendship between two people, or throws NOT_FRIENDS. */
  async requireFriends(me: string, other: string) {
    const f = await this.prisma.friendship.findUnique({ where: this.pairWhere(me, other) });
    if (!f || f.status !== FriendshipStatus.ACCEPTED) throw new AppError(ErrorCode.NOT_FRIENDS, 'You are not friends', HttpStatus.FORBIDDEN);
    return f;
  }

  async request(me: string, targetId: string): Promise<{ state: FriendState; paidCoins: number }> {
    if (me === targetId) throw AppError.forbidden("That's you");
    if (await this.blocks.eitherBlocked(me, targetId)) throw new AppError(ErrorCode.BLOCKED, 'Not available', HttpStatus.FORBIDDEN);
    const existing = await this.prisma.friendship.findUnique({ where: this.pairWhere(me, targetId) });
    if (existing?.status === FriendshipStatus.ACCEPTED) return { state: 'friends', paidCoins: 0 };
    if (existing && existing.requesterId === me) return { state: 'requested', paidCoins: 0 };
    if (existing) {
      await this.accept(me, targetId);
      return { state: 'friends', paidCoins: 0 };
    }
    const met = await this.prisma.match.count({ where: { OR: [{ userAId: me, userBId: targetId }, { userAId: targetId, userBId: me }] } });
    if (!met) throw new AppError(ErrorCode.NEVER_MATCHED, 'You can add people you have met in a match', HttpStatus.FORBIDDEN);
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { name: true } });
    const [low, high] = orderedPair(me, targetId);
    const { paidCoins } = await this.prisma.tx(async (tx) => {
      const paid = await this.rewards.payForFriendRequest(me, target.name || 'someone', tx);
      await tx.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: me } });
      return paid;
    });
    this.wallet.changed([me]);
    const meUser = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, include: PROFILE_INCLUDE });
    this.realtime.toUser(targetId, ServerEvent.FriendRequest, { from: toPublicProfile(meUser, this.clock.now()) });
    return { state: 'requested', paidCoins };
  }

  async accept(me: string, requesterId: string): Promise<void> {
    const f = await this.prisma.friendship.findUnique({ where: this.pairWhere(me, requesterId) });
    if (!f || f.requesterId === me) throw AppError.notFound('Friend request');
    if (f.status === FriendshipStatus.ACCEPTED) return;
    await this.prisma.friendship.update({ where: { id: f.id }, data: { status: FriendshipStatus.ACCEPTED, acceptedAt: this.clock.now() } });
    const meUser = await this.prisma.user.findUniqueOrThrow({ where: { id: me }, include: PROFILE_INCLUDE });
    this.realtime.toUser(requesterId, ServerEvent.FriendAccepted, { friend: await this.view(requesterId, meUser.id) });
  }

  async decline(me: string, requesterId: string): Promise<void> {
    await this.prisma.friendship.deleteMany({ where: { ...pairFields(me, requesterId), status: FriendshipStatus.PENDING, requesterId } });
  }

  async remove(me: string, other: string): Promise<void> {
    await this.prisma.friendship.deleteMany({ where: pairFields(me, other) });
    this.realtime.toUser(other, ServerEvent.FriendRemoved, { userId: me });
  }

  async state(me: string, other: string): Promise<FriendState | 'none'> {
    const f = await this.prisma.friendship.findUnique({ where: this.pairWhere(me, other) });
    if (!f) return 'none';
    if (f.status === FriendshipStatus.ACCEPTED) return 'friends';
    return f.requesterId === me ? 'requested' : 'incoming';
  }

  /** Friends, incoming and sent requests — with last message, unread and presence. */
  async list(me: string): Promise<FriendView[]> {
    const rows = await this.prisma.friendship.findMany({ where: { OR: [{ userLowId: me }, { userHighId: me }] }, orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }] });
    if (!rows.length) return [];
    const otherIds = rows.map((f) => (f.userLowId === me ? f.userHighId : f.userLowId));
    const ids = rows.map((f) => f.id);
    const [users, last, unread, online] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: otherIds } }, include: PROFILE_INCLUDE }),
      this.prisma.$queryRaw<{ friendshipId: string; text: string; giftId: string | null; createdAt: Date }[]>`
        SELECT DISTINCT ON ("friendshipId") "friendshipId", "text", "giftId", "createdAt"
          FROM "Message" WHERE "friendshipId" IN (${Prisma.join(ids)})
         ORDER BY "friendshipId", "createdAt" DESC`,
      this.prisma.message.groupBy({ by: ['friendshipId'], where: { friendshipId: { in: ids }, senderId: { not: me }, readAt: null }, _count: { _all: true } }),
      this.realtime.onlineMap(otherIds),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));
    const lastBy = new Map(last.map((m) => [m.friendshipId, m]));
    const unreadBy = new Map(unread.map((u) => [u.friendshipId, u._count._all]));
    const now = this.clock.now();
    return rows.flatMap((f) => {
      const otherId = f.userLowId === me ? f.userHighId : f.userLowId;
      const u = byUser.get(otherId);
      if (!u || u.status !== 'ACTIVE') return [];
      const m = lastBy.get(f.id);
      return [
        {
          profile: toPublicProfile(u, now),
          state: f.status === FriendshipStatus.ACCEPTED ? 'friends' : f.requesterId === me ? 'requested' : 'incoming',
          since: (f.acceptedAt ?? f.createdAt).toISOString(),
          lastMessage: m?.text ?? null,
          lastMessageAt: m?.createdAt.toISOString() ?? null,
          unread: unreadBy.get(f.id) ?? 0,
          online: online[otherId] ?? false,
        } satisfies FriendView,
      ];
    });
  }

  async view(me: string, otherId: string): Promise<FriendView | undefined> {
    return (await this.list(me)).find((f) => f.profile.id === otherId);
  }
}

const pairFields = (a: string, b: string) => {
  const [low, high] = orderedPair(a, b);
  return { userLowId: low, userHighId: high };
};
