import { Injectable } from '@nestjs/common';
import { CashoutStatus, PurchaseStatus, ReportStatus, UserStatus } from '@prisma/client';

import { Clock, MS } from '../../../common/utils/clock';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { EconomyService } from '../../catalog/economy.service';
import { MatchingService } from '../../matching/matching.service';
import { discoverCallsReport, type DiscoverCallsReport } from './discover-stats';
import { type MarketingReport, marketingReport } from './marketing-stats';
import { buildFunnel, CohortCounts, FunnelReport } from './funnel';

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

  /** Discover and chat-call numbers (cached 2 min). */
  async discover(days: number): Promise<DiscoverCallsReport> {
    return this.redis.remember(`admin:dash:discover:${days}`, 120, () => discoverCallsReport(this.prisma, this.economy.rules, days, this.clock.now()));
  }

  /** Marketing-site traffic for the last `days` days (cached 60 s). */
  async marketing(days: number): Promise<MarketingReport> {
    return this.redis.remember(`admin:dash:marketing:${days}`, 60, () =>
      marketingReport(this.prisma, days, this.clock.now(), this.config.get('BUSINESS_TZ_OFFSET_MINUTES'), new URL(this.config.get('INVITE_LINK_BASE')).origin),
    );
  }

  /** New-user funnel for people who signed up in the last `days` business days (cached 5 min). */
  async funnel(days: number): Promise<FunnelReport> {
    return this.redis.remember(`admin:dash:funnel:${days}`, 300, () => this.computeFunnel(days));
  }

  private async computeFunnel(days: number): Promise<FunnelReport> {
    const offset = this.config.get('BUSINESS_TZ_OFFSET_MINUTES');
    const todayIdx = this.clock.dayOf().getTime();
    const start = new Date(todayIdx - (days - 1) * MS.day - offset * MS.minute);
    // Sign-ups in the window, and each one's first call (either side of the match).
    const cte = `
      WITH c AS (
        SELECT u.id, u."createdAt", u."onboardedAt", u.verified, u."avatarUrl", u.bio, u.interests,
               (u."createdAt" + make_interval(mins => ${Math.trunc(offset)}))::date AS d
          FROM "User" u
         WHERE u."isBot" = false AND u."createdAt" >= $1
      ), first AS (
        SELECT DISTINCT ON (x.id) x.id, x.s, x.e FROM (
          SELECT c.id, m."startedAt" AS s, m."endedAt" AS e FROM c JOIN "Match" m ON m."userAId" = c.id
          UNION ALL
          SELECT c.id, m."startedAt", m."endedAt" FROM c JOIN "Match" m ON m."userBId" = c.id
        ) x ORDER BY x.id, x.s
      )`;
    type Row = { day: string; signups: bigint; set_up: bigint; first_call: bigint; came_back: bigint; paid: bigint; complete: bigint; verified: bigint; within_hour: bigint; quick: bigint };
    const [rows, median] = await Promise.all([
      this.prisma.$queryRawUnsafe<Row[]>(
        `${cte}
        SELECT to_char(c.d, 'YYYY-MM-DD') AS day,
               COUNT(*) AS signups,
               COUNT(*) FILTER (WHERE c."onboardedAt" IS NOT NULL) AS set_up,
               COUNT(first.id) AS first_call,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "UserActiveDay" a WHERE a."userId" = c.id AND a.day = c.d + 1)) AS came_back,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Purchase" p WHERE p."userId" = c.id AND p.status = 'SUCCEEDED')) AS paid,
               COUNT(*) FILTER (WHERE c."avatarUrl" <> '' AND btrim(c.bio) <> '' AND cardinality(c.interests) >= 3) AS complete,
               COUNT(*) FILTER (WHERE c.verified) AS verified,
               COUNT(first.id) FILTER (WHERE first.s - c."createdAt" <= interval '1 hour') AS within_hour,
               COUNT(first.id) FILTER (WHERE first.e IS NOT NULL AND first.e - first.s < interval '10 seconds') AS quick
          FROM c LEFT JOIN first ON first.id = c.id
         GROUP BY c.d`,
        start,
      ),
      this.prisma.$queryRawUnsafe<{ minutes: number | null }[]>(
        `${cte}
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM first.s - c."createdAt") / 60)::float AS minutes
          FROM c JOIN first ON first.id = c.id`,
        start,
      ),
    ]);

    const byDay = new Map(rows.map((r) => [r.day, r]));
    const cohorts: CohortCounts[] = [];
    for (let i = 0; i < days; i++) {
      const dayMs = todayIdx - (days - 1 - i) * MS.day;
      const day = new Date(dayMs).toISOString().slice(0, 10);
      const r = byDay.get(day);
      cohorts.push({
        day,
        signups: num(r?.signups),
        setUp: num(r?.set_up),
        firstCall: num(r?.first_call),
        cameBack: num(r?.came_back),
        // "Next day" is over once today is at least two days after sign-up.
        d1Ready: todayIdx - dayMs >= 2 * MS.day,
        paid: num(r?.paid),
        complete: num(r?.complete),
        verified: num(r?.verified),
        withinHour: num(r?.within_hour),
        quickSkip: num(r?.quick),
      });
    }
    return buildFunnel(cohorts, median[0]?.minutes ?? null, days, this.clock.now());
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
