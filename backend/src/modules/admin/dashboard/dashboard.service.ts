import { Injectable } from '@nestjs/common';
import { CashoutStatus, PurchaseStatus, ReportStatus, UserStatus } from '@prisma/client';

import { Clock, MS } from '../../../common/utils/clock';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { EconomyService } from '../../catalog/economy.service';
import { MatchingService } from '../../matching/matching.service';

export type SeriesPoint = { day: string; signups: number; revenueUsd: number; purchases: number; matches: number; matchers: number; gifts: number; payoutsUsd: number; reports: number };

const num = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/**
 * Numbers for the dashboard. Aggregates are cached in Redis for a minute
 * (all instances share them) so a room full of people refreshing the
 * dashboard costs one set of queries per minute, not one per person.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly matching: MatchingService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
  ) {}

  async summary() {
    const live = await this.matching.onlineCount();
    const cached = await this.redis.remember('admin:dash:summary', 60, () => this.computeSummary());
    return { ...cached, live: { ...live, calls: cached.live.calls } };
  }

  async series(days: number): Promise<SeriesPoint[]> {
    return this.redis.remember(`admin:dash:series:${days}`, 300, () => this.computeSeries(days));
  }

  private async computeSummary() {
    const now = this.clock.now();
    const today = this.clock.startOfDay(now);
    const d7 = new Date(now.getTime() - 7 * MS.day);
    const d30 = new Date(now.getTime() - 30 * MS.day);
    const realUser = { status: UserStatus.ACTIVE, isBot: false };
    const succeeded = (since: Date) => ({ status: PurchaseStatus.SUCCEEDED, completedAt: { gte: since } });

    const [
      totalUsers,
      newToday,
      new7,
      activeToday,
      active7,
      verified,
      banned,
      revenueToday,
      revenue30,
      payers30,
      vipActive,
      gifts30,
      payouts30,
      openReports,
      reportsToday,
      cashoutsReview,
      cashoutsStuck,
      pendingPurchases,
      liveCalls,
      wallets,
      quality,
      referred7,
      partnerReferred7,
      referralsRewarded7,
      partnersPending,
      partnerPayoutsOpen,
    ] = await Promise.all([
      this.prisma.user.count({ where: realUser }),
      this.prisma.user.count({ where: { ...realUser, createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { ...realUser, createdAt: { gte: d7 } } }),
      this.prisma.user.count({ where: { ...realUser, lastSeenAt: { gte: today } } }),
      this.prisma.user.count({ where: { ...realUser, lastSeenAt: { gte: d7 } } }),
      this.prisma.user.count({ where: { ...realUser, verified: true } }),
      this.prisma.user.count({ where: { ...realUser, bannedUntil: { gt: now } } }),
      this.prisma.purchase.aggregate({ where: succeeded(today), _sum: { usdCents: true }, _count: true }),
      this.prisma.purchase.aggregate({ where: succeeded(d30), _sum: { usdCents: true }, _count: true }),
      this.prisma.purchase.groupBy({ by: ['userId'], where: succeeded(d30) }).then((r) => r.length),
      this.prisma.wallet.count({ where: { vipUntil: { gt: now }, user: { isBot: false } } }),
      this.prisma.giftTransfer.aggregate({ where: { createdAt: { gte: d30 } }, _sum: { coins: true, gems: true }, _count: true }),
      this.prisma.cashout.aggregate({ where: { status: CashoutStatus.PAID, processedAt: { gte: d30 } }, _sum: { usdCents: true }, _count: true }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.count({ where: { createdAt: { gte: today } } }),
      this.prisma.cashout.count({ where: { status: CashoutStatus.REVIEW } }),
      this.prisma.cashout.count({ where: { status: CashoutStatus.PROCESSING, createdAt: { lt: new Date(now.getTime() - 30 * MS.minute) } } }),
      this.prisma.purchase.count({ where: { status: PurchaseStatus.REQUIRES_ACTION } }),
      this.prisma.match.count({ where: { endedAt: null, startedAt: { gt: new Date(now.getTime() - 6 * MS.hour) } } }),
      this.prisma.wallet.aggregate({ where: { user: { isBot: false } }, _sum: { coins: true, gems: true } }),
      this.prisma.$queryRaw<{ n: bigint; today: bigint; avg: number | null; quick: bigint }[]>`
        SELECT COUNT(*) AS n,
               COUNT(*) FILTER (WHERE "startedAt" >= ${today}) AS today,
               AVG(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")))::float AS avg,
               COUNT(*) FILTER (WHERE "endedAt" - "startedAt" < interval '10 seconds') AS quick
          FROM "Match" WHERE "startedAt" >= ${d7} AND "endedAt" IS NOT NULL`,
      this.prisma.referral.count({ where: { createdAt: { gte: d7 } } }),
      this.prisma.referral.count({ where: { createdAt: { gte: d7 }, affiliateId: { not: null } } }),
      this.prisma.referral.count({ where: { rewardedAt: { gte: d7 } } }),
      this.prisma.affiliate.count({ where: { status: 'PENDING' } }),
      this.prisma.affiliatePayout.count({ where: { status: 'REQUESTED' } }),
    ]);

    const rev30 = num(revenue30._sum.usdCents);
    const q = quality[0];
    return {
      generatedAt: now.toISOString(),
      users: { total: totalUsers, newToday, new7d: new7, activeToday, active7d: active7, verified, banned },
      revenue: {
        todayUsd: num(revenueToday._sum.usdCents) / 100,
        todayPurchases: revenueToday._count,
        last30Usd: rev30 / 100,
        last30Purchases: revenue30._count,
        payers30: payers30,
        arppuUsd: payers30 ? Math.round(rev30 / payers30) / 100 : 0,
        vipActive,
        vipShare: totalUsers ? vipActive / totalUsers : 0,
      },
      gifts: { last30Count: gifts30._count, last30Coins: num(gifts30._sum.coins), last30Gems: num(gifts30._sum.gems) },
      payouts: { last30Usd: num(payouts30._sum.usdCents) / 100, last30Count: payouts30._count },
      liabilities: {
        coinsOutstanding: num(wallets._sum.coins),
        gemsOutstanding: num(wallets._sum.gems),
        gemsUsd: Math.floor(num(wallets._sum.gems) * this.economy.rules.usdCentsPerGem) / 100,
      },
      queues: { openReports, reportsToday, cashoutsReview, cashoutsStuck, pendingPurchases, partnersPending, partnerPayoutsOpen },
      growth: { referredSignups7d: referred7, partnerSignups7d: partnerReferred7, referralsRewarded7d: referralsRewarded7 },
      matches: {
        today: num(q?.today),
        last7d: num(q?.n),
        avgSeconds: Math.round(q?.avg ?? 0),
        quickSkipRate: num(q?.n) ? num(q?.quick) / num(q?.n) : 0,
      },
      live: { calls: liveCalls },
    };
  }

  /** One row per business day, oldest first, zero-filled. */
  private async computeSeries(days: number): Promise<SeriesPoint[]> {
    const offset = this.config.get('BUSINESS_TZ_OFFSET_MINUTES');
    const start = new Date(this.clock.dayOf().getTime() - (days - 1) * MS.day - offset * MS.minute);
    const dayExpr = (col: string) => `to_char(date_trunc('day', "${col}" + make_interval(mins => ${offset})), 'YYYY-MM-DD')`;
    const q = <T>(sql: string) => this.prisma.$queryRawUnsafe<T[]>(sql, start);

    const [signups, revenue, matches, gifts, payouts, reports] = await Promise.all([
      q<{ day: string; n: bigint }>(`SELECT ${dayExpr('createdAt')} AS day, COUNT(*) AS n FROM "User" WHERE "createdAt" >= $1 AND "isBot" = false GROUP BY 1`),
      q<{ day: string; cents: bigint; n: bigint }>(`SELECT ${dayExpr('completedAt')} AS day, SUM("usdCents") AS cents, COUNT(*) AS n FROM "Purchase" WHERE status = 'SUCCEEDED' AND "completedAt" >= $1 GROUP BY 1`),
      q<{ day: string; n: bigint; people: bigint }>(
        `SELECT day, COUNT(DISTINCT id) AS n, COUNT(DISTINCT u) AS people FROM (
           SELECT ${dayExpr('startedAt')} AS day, id, unnest(ARRAY["userAId","userBId"]) AS u FROM "Match" WHERE "startedAt" >= $1
         ) m GROUP BY 1`,
      ),
      q<{ day: string; n: bigint }>(`SELECT ${dayExpr('createdAt')} AS day, COUNT(*) AS n FROM "GiftTransfer" WHERE "createdAt" >= $1 GROUP BY 1`),
      q<{ day: string; cents: bigint }>(`SELECT ${dayExpr('processedAt')} AS day, SUM("usdCents") AS cents FROM "Cashout" WHERE status = 'PAID' AND "processedAt" >= $1 GROUP BY 1`),
      q<{ day: string; n: bigint }>(`SELECT ${dayExpr('createdAt')} AS day, COUNT(*) AS n FROM "Report" WHERE "createdAt" >= $1 GROUP BY 1`),
    ]);

    const by = <T extends { day: string }>(rows: T[]) => new Map(rows.map((r) => [r.day, r]));
    const [s, r, m, g, p, rp] = [by(signups), by(revenue), by(matches), by(gifts), by(payouts), by(reports)];
    const out: SeriesPoint[] = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(this.clock.dayOf().getTime() - (days - 1 - i) * MS.day).toISOString().slice(0, 10);
      out.push({
        day,
        signups: num(s.get(day)?.n),
        revenueUsd: num(r.get(day)?.cents) / 100,
        purchases: num(r.get(day)?.n),
        matches: num(m.get(day)?.n),
        matchers: num(m.get(day)?.people),
        gifts: num(g.get(day)?.n),
        payoutsUsd: num(p.get(day)?.cents) / 100,
        reports: num(rp.get(day)?.n),
      });
    }
    return out;
  }
}
