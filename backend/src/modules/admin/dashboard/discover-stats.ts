import { MatchEndReason, MatchKind, SwipeKind } from '@prisma/client';

import type { EconomyRules } from '../../catalog/economy';
import type { PrismaService } from '../../../infra/prisma/prisma.service';

export interface DiscoverCallsReport {
  days: number;
  generatedAt: string;
  discover: {
    /** People who would show up in decks right now. */
    visibleNow: number;
    likes: number;
    superLikes: number;
    passes: number;
    /** Distinct people who swiped. */
    swipers: number;
    matches: number;
    /** Likes still waiting for an answer (all time). */
    pendingLikes: number;
  };
  calls: {
    asked: number;
    allowed: number;
    notNow: number;
    turnedOff: number;
    /** Chats where both allow calls right now. */
    chatsWithCallsOn: number;
    calls: number;
    missed: number;
    declined: number;
    avgSeconds: number;
    reported: number;
  };
  recentCalls: {
    id: string;
    startedAt: string;
    seconds: number | null;
    a: { id: string; name: string };
    b: { id: string; name: string };
    endReason: MatchEndReason | null;
  }[];
}

/** Discover and chat-call numbers for the last `days` days (admin "Discover and calls" page). */
export async function discoverCallsReport(
  prisma: PrismaService,
  rules: EconomyRules,
  days: number,
  now: Date,
): Promise<DiscoverCallsReport> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const activeSince = new Date(now.getTime() - rules.discoverActiveDays * 86_400_000);
  const [swipes, swipers, events, visibleNow, pendingLikes, callsOn, calls, recent] = await Promise.all([
    prisma.discoverSwipe.groupBy({ by: ['kind'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.discoverSwipe.findMany({
      where: { createdAt: { gte: since } },
      distinct: ['fromId'],
      select: { fromId: true },
    }),
    prisma.$queryRaw<
      { e: string | null; n: bigint }[]
    >`SELECT "meta"->>'event' AS e, count(*) AS n FROM "Message" WHERE "kind" = 'SYSTEM' AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.user.count({
      where: {
        status: 'ACTIVE',
        isBot: false,
        deletedAt: null,
        privateAccount: false,
        showInDiscover: true,
        avatarUrl: { not: '' },
        onboardedAt: { not: null },
        lastSeenAt: { gte: activeSince },
      },
    }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "DiscoverSwipe" s
       WHERE s."kind" IN ('LIKE', 'SUPER')
         AND NOT EXISTS (SELECT 1 FROM "DiscoverSwipe" b WHERE b."fromId" = s."toId" AND b."toId" = s."fromId")`,
    prisma.friendship.count({ where: { callsLowAllowed: true, callsHighAllowed: true } }),
    prisma.match.findMany({
      where: { kind: MatchKind.FRIEND, startedAt: { gte: since } },
      select: { startedAt: true, endedAt: true, endReason: true },
    }),
    prisma.match.findMany({
      where: { kind: MatchKind.FRIEND },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: { id: true, startedAt: true, endedAt: true, endReason: true, userAId: true, userBId: true },
    }),
  ]);
  const swipe = (k: SwipeKind) => swipes.find((s) => s.kind === k)?._count._all ?? 0;
  const ev = (e: string) => Number(events.find((x) => x.e === e)?.n ?? 0);
  const ended = calls.filter((c) => c.endedAt);
  const avgSeconds = ended.length
    ? Math.round(ended.reduce((a, c) => a + (c.endedAt!.getTime() - c.startedAt.getTime()) / 1000, 0) / ended.length)
    : 0;
  const names = await prisma.user.findMany({
    where: { id: { in: [...new Set(recent.flatMap((r) => [r.userAId, r.userBId]))] } },
    select: { id: true, name: true },
  });
  const nameOf = (id: string) => ({ id, name: names.find((n) => n.id === id)?.name || 'Someone' });
  return {
    days,
    generatedAt: now.toISOString(),
    discover: {
      visibleNow,
      likes: swipe(SwipeKind.LIKE),
      superLikes: swipe(SwipeKind.SUPER),
      passes: swipe(SwipeKind.PASS),
      swipers: swipers.length,
      matches: ev('matched'),
      pendingLikes: Number(pendingLikes[0]?.n ?? 0),
    },
    calls: {
      asked: ev('calls_asked'),
      allowed: ev('calls_on'),
      notNow: ev('calls_declined'),
      turnedOff: ev('calls_off'),
      chatsWithCallsOn: callsOn,
      calls: calls.length,
      missed: ev('call_missed'),
      declined: ev('call_declined'),
      avgSeconds,
      reported: calls.filter((c) => c.endReason === MatchEndReason.REPORTED).length,
    },
    recentCalls: recent.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      seconds: r.endedAt ? Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 1000) : null,
      a: nameOf(r.userAId),
      b: nameOf(r.userBId),
      endReason: r.endReason,
    })),
  };
}
