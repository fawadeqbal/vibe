import { Injectable } from '@nestjs/common';
import { FollowStatus, LedgerKind } from '@prisma/client';

import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  /** Gems from gifts (incl. Vibe Hour bonus) received that week. */
  gemsEarned: number;
  giftsReceived: number;
  likesReceived: number;
  newFollowers: number;
  matches: number;
  /** Longest friend streak counted during that week. */
  bestStreak: number;
}

/** "Your week on Vibe": last business week's numbers (Monday–Sunday). */
@Injectable()
export class RecapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Monday 00:00 → next Monday 00:00 of last week. */
  lastWeek(): { week: number; from: Date; to: Date } {
    const week = this.clock.weekIndex() - 1;
    const from = this.clock.weekStart(week);
    return { week, from, to: new Date(from.getTime() + 7 * MS.day) };
  }

  async forUser(userId: string): Promise<WeeklyRecap> {
    return (await this.forUsers([userId])).get(userId)!;
  }

  /** The same numbers for many people at once (the Monday job), a handful of grouped queries. */
  async forUsers(ids: string[]): Promise<Map<string, WeeklyRecap>> {
    const { from, to } = this.lastWeek();
    const between = { gte: from, lt: to };
    const firstDay = this.clock.dayIndex(from);
    const [gems, gifts, likes, follows, matches, streaks] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({ by: ['userId'], where: { userId: { in: ids }, createdAt: between, gems: { gt: 0 }, kind: { in: [LedgerKind.GIFT_RECEIVED, LedgerKind.EARN] } }, _sum: { gems: true } }),
      this.prisma.giftTransfer.groupBy({ by: ['toId'], where: { toId: { in: ids }, createdAt: between }, _count: { _all: true } }),
      this.prisma.matchLike.groupBy({ by: ['toId'], where: { toId: { in: ids }, createdAt: between }, _count: { _all: true } }),
      this.prisma.follow.groupBy({ by: ['followeeId'], where: { followeeId: { in: ids }, status: FollowStatus.ACTIVE, acceptedAt: between }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ id: string; n: bigint }[]>`
        SELECT u.id, COUNT(*) AS n FROM unnest(${ids}::text[]) AS u(id)
          JOIN "Match" m ON (m."userAId" = u.id OR m."userBId" = u.id)
         WHERE m."startedAt" >= ${from} AND m."startedAt" < ${to}
         GROUP BY u.id`,
      this.prisma.$queryRaw<{ id: string; best: number }[]>`
        SELECT u.id, MAX(f."streakCount")::int AS best FROM unnest(${ids}::text[]) AS u(id)
          JOIN "Friendship" f ON (f."userLowId" = u.id OR f."userHighId" = u.id)
         WHERE f."status" = 'ACCEPTED' AND f."streakDay" >= ${firstDay} AND f."streakDay" < ${firstDay + 7}
         GROUP BY u.id`,
    ]);
    const num = <T>(rows: T[], key: (r: T) => string, val: (r: T) => number | bigint | null) => new Map(rows.map((r) => [key(r), Number(val(r) ?? 0)]));
    const g = num(gems, (r) => r.userId, (r) => r._sum.gems);
    const gi = num(gifts, (r) => r.toId, (r) => r._count._all);
    const l = num(likes, (r) => r.toId, (r) => r._count._all);
    const fo = num(follows, (r) => r.followeeId, (r) => r._count._all);
    const ma = num(matches, (r) => r.id, (r) => r.n);
    const st = num(streaks, (r) => r.id, (r) => r.best);
    return new Map(
      ids.map((id) => [
        id,
        { weekStart: from.toISOString(), weekEnd: to.toISOString(), gemsEarned: g.get(id) ?? 0, giftsReceived: gi.get(id) ?? 0, likesReceived: l.get(id) ?? 0, newFollowers: fo.get(id) ?? 0, matches: ma.get(id) ?? 0, bestStreak: st.get(id) ?? 0 },
      ]),
    );
  }
}

/** Something worth telling: they received anything at all. */
export const recapWorthSending = (r: WeeklyRecap): boolean => r.giftsReceived > 0 || r.likesReceived > 0 || r.newFollowers > 0 || r.gemsEarned > 0;

export function recapText(r: WeeklyRecap): string {
  const parts: string[] = [];
  if (r.gemsEarned) parts.push(`💎 ${r.gemsEarned.toLocaleString('en-US')} gems earned`);
  if (r.giftsReceived) parts.push(`🎁 ${r.giftsReceived} ${r.giftsReceived === 1 ? 'gift' : 'gifts'}`);
  if (r.likesReceived) parts.push(`💖 ${r.likesReceived} ${r.likesReceived === 1 ? 'like' : 'likes'}`);
  if (r.newFollowers) parts.push(`👥 ${r.newFollowers} new ${r.newFollowers === 1 ? 'follower' : 'followers'}`);
  if (r.matches) parts.push(`🎥 ${r.matches} ${r.matches === 1 ? 'match' : 'matches'}`);
  if (r.bestStreak) parts.push(`🔥 best streak ${r.bestStreak} ${r.bestStreak === 1 ? 'day' : 'days'}`);
  return `Here's your week on Vibe:\n${parts.join('\n')}`;
}

