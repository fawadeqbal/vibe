import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Clock, MS } from '../../../common/utils/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { buildNotes, Note, Pair } from './notes';

/** Who to count: everyone, people who joined in the app, or on the web. */
export type ClientFilter = 'all' | 'app' | 'web';

/** A call that lasted at least this long counts as a good call. */
export const GOOD_CALL_SECONDS = 60;

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const rate = (a: number, b: number) => (b > 0 ? a / b : null);

interface Window {
  from: Date;
  to: Date;
  days: number;
}

export interface Kpis {
  goodCalls: number;
  /** Average people active per day. */
  active: number;
  signups: number;
  goodFirstCall: number;
  /** Came back the day after signing up, of those whose next day has started. */
  cameBack: number;
  cameBackEligible: number;
  revenueUsd: number;
}

export interface HealthReport {
  generatedAt: string;
  days: number;
  client: ClientFilter;
  current: Kpis;
  previous: Kpis;
  daily: { day: string; goodCalls: number; active: number; signups: number; revenueUsd: number }[];
  notes: Note[];
  attention: { key: string; text: string; href: string; tone: 'bad' | 'warn' }[];
}

export interface MatchingReport {
  generatedAt: string;
  days: number;
  /** When search tracking started (null = nothing yet). */
  collectingSince: string | null;
  searches: { total: number; matched: number; gaveUp: number; gaveUpRate: number | null; avgWaitSec: number | null; p50WaitSec: number | null; p90WaitSec: number | null; rematchSoon: number };
  /** isoDow 1 (Mon) – 7 (Sun) × hour 0–23, business time. */
  heatmap: { dow: number; hour: number; searches: number; avgWaitSec: number | null; gaveUp: number }[];
  byHour: { hour: number; searches: number; avgWaitSec: number | null; gaveUpRate: number | null }[];
  calls: { total: number; avgSeconds: number; quick: number; quickRate: number | null; good: number; goodRate: number | null; reports: number; reportsPer100: number | null };
}

export interface SourceRow {
  source: string;
  visitors: number;
  downloads: number;
  signups: number;
  setUp: number;
  firstCall: number;
  goodFirstCall: number;
  cameBack: number;
  cameBackEligible: number;
  week: number;
  weekEligible: number;
  paid: number;
}

export interface GrowthReport {
  generatedAt: string;
  days: number;
  client: ClientFilter;
  sources: SourceRow[];
  total: SourceRow;
  /** Sign-ups per business day in the window, by where the account was made (other = before this was recorded). */
  daily: { day: string; app: number; web: number; other: number; total: number }[];
  /** Sign-up weeks, newest first: share still active on day 1, 7 and 30 (null = too new). */
  cohorts: { week: string; signups: number; d1: number | null; d7: number | null; d30: number | null }[];
}

export interface AdsReport {
  generatedAt: string;
  days: number;
  /** Store videos asked for / confirmed by the network / paid in coins. */
  started: number;
  watched: number;
  paid: number;
  /** Confirmed, but the network paid us nothing (Monetag `non_valued`). */
  unpaidByNetwork: number;
  coinsGiven: number;
  /** The network's own estimate (postbacks), USD. */
  estimatedUsd: number;
  previousEstimatedUsd: number;
  people: number;
  daily: { day: string; started: number; watched: number; paid: number; estimatedUsd: number }[];
  byPlatform: { platform: string; started: number; paid: number; estimatedUsd: number }[];
}

export interface MoneyReport {
  generatedAt: string;
  days: number;
  client: ClientFilter;
  revenueUsd: number;
  purchases: number;
  payers: number;
  activePeople: number;
  payingShare: number | null;
  arppuUsd: number | null;
  firstTimePayers: number;
  medianDaysToFirstPurchase: number | null;
  repeatPayers: number;
  products: { type: string; productId: string; purchases: number; revenueUsd: number }[];
  previousRevenueUsd: number;
}

/**
 * The admin Overview, as answers: is Vibe healthy (Dashboard), can people
 * find someone (Matching), which sources bring people who stay (Growth),
 * and who pays for what (Money). All windows are business days; cached 60 s.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly dashboard: DashboardService,
  ) {}

  private window(days: number, back = 0): Window {
    const today = this.clock.startOfDay();
    const from = new Date(today.getTime() - (days - 1 + back * days) * MS.day);
    const to = back ? new Date(from.getTime() + days * MS.day) : this.clock.now();
    return { from, to, days };
  }

  private get off() {
    return Math.trunc(this.clock.offsetMinutes);
  }

  /** `u` joined in the app / on the web. */
  private joined(client: ClientFilter, alias = 'u'): Prisma.Sql {
    const col = Prisma.raw(`${alias}."signupClient"`);
    if (client === 'app') return Prisma.sql`${col} IN ('android', 'ios')`;
    if (client === 'web') return Prisma.sql`${col} = 'web'`;
    return Prisma.sql`TRUE`;
  }

  /** Business-day start of a timestamp column, in SQL. */
  private dayOf(col: string): Prisma.Sql {
    return Prisma.sql`(date_trunc('day', ${Prisma.raw(col)} + make_interval(mins => ${this.off}::int)) - make_interval(mins => ${this.off}::int))`;
  }

  /**
   * (uid, day) for every person active on a business day: any signed-in use
   * (recorded per client) or any call. With a client filter, only use of that client.
   */
  private activity(from: Date, to: Date, client: ClientFilter): Prisma.Sql {
    const clientCond = client === 'app' ? Prisma.sql`AND a.client IN ('android', 'ios')` : client === 'web' ? Prisma.sql`AND a.client = 'web'` : Prisma.empty;
    const calls =
      client === 'all'
        ? Prisma.sql`UNION
          SELECT p.uid, ${this.dayOf('m."startedAt"')} AS day
            FROM "Match" m CROSS JOIN LATERAL (VALUES (m."userAId"), (m."userBId")) p(uid)
           WHERE m."startedAt" >= ${from} AND m."startedAt" < ${to}`
        : Prisma.empty;
    return Prisma.sql`(
      SELECT a."userId" AS uid, a.day FROM "ClientActivity" a WHERE a.day >= ${from} AND a.day < ${to} ${clientCond}
      ${calls}
    )`;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────

  async health(days: number, client: ClientFilter): Promise<HealthReport> {
    return this.redis.remember(`admin:insights:health:${days}:${client}`, 60, () => this.buildHealth(days, client));
  }

  private async kpis(w: Window, client: ClientFilter): Promise<Kpis> {
    const good = Prisma.sql`m."endedAt" - m."startedAt" >= make_interval(secs => ${GOOD_CALL_SECONDS})`;
    const [calls, active, signups, revenue] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "Match" m JOIN "User" a ON a.id = m."userAId" JOIN "User" b ON b.id = m."userBId"
         WHERE m."startedAt" >= ${w.from} AND m."startedAt" < ${w.to} AND m."endedAt" IS NOT NULL AND ${good}
           AND NOT a."isBot" AND NOT b."isBot" AND (${this.joined(client, 'a')} OR ${this.joined(client, 'b')})`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM (SELECT DISTINCT act.uid, act.day FROM ${this.activity(w.from, w.to, client)} act) x
          JOIN "User" u ON u.id = x.uid WHERE NOT u."isBot"`,
      this.prisma.$queryRaw<{ signups: bigint; good_first: bigint; came_back: bigint; eligible: bigint }[]>`
        WITH s AS (
          SELECT u.id, u."createdAt", ${this.dayOf('u."createdAt"')} AS sday FROM "User" u
           WHERE NOT u."isBot" AND u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to} AND ${this.joined(client)}
        ), act AS ${this.activity(w.from, new Date(w.to.getTime() + MS.day), 'all')}
        SELECT count(*) AS signups,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM "vw_real_call" c WHERE c.user_id = s.id AND c.started_at < s."createdAt" + interval '48 hours'
                   AND c.seconds >= ${GOOD_CALL_SECONDS})) AS good_first,
               count(*) FILTER (WHERE s.sday + interval '1 day' <= ${this.clock.startOfDay()} AND EXISTS (
                 SELECT 1 FROM act WHERE act.uid = s.id AND act.day = s.sday + interval '1 day')) AS came_back,
               count(*) FILTER (WHERE s.sday + interval '1 day' <= ${this.clock.startOfDay()}) AS eligible
          FROM s`,
      this.prisma.$queryRaw<{ cents: bigint | null }[]>`
        SELECT sum(p.usd_cents) AS cents FROM "vw_real_payment" p JOIN "User" u ON u.id = p.user_id
         WHERE p.completed_at >= ${w.from} AND p.completed_at < ${w.to} AND ${this.joined(client)}`,
    ]);
    const s = signups[0];
    return {
      goodCalls: n(calls[0]?.n),
      active: Math.round((n(active[0]?.n) / w.days) * 10) / 10,
      signups: n(s?.signups),
      goodFirstCall: n(s?.good_first),
      cameBack: n(s?.came_back),
      cameBackEligible: n(s?.eligible),
      revenueUsd: n(revenue[0]?.cents) / 100,
    };
  }

  private async buildHealth(days: number, client: ClientFilter): Promise<HealthReport> {
    const w = this.window(days);
    const p = this.window(days, 1);
    const good = Prisma.sql`m."endedAt" - m."startedAt" >= make_interval(secs => ${GOOD_CALL_SECONDS})`;
    const series = Math.max(days, 7);
    const sw = this.window(series);
    const [current, previous, matching, growth, summary, appeals, waitingNow, dailyCalls, dailyActive, dailySignups, dailyRevenue] = await Promise.all([
      this.kpis(w, client),
      this.kpis(p, client),
      this.matching(days),
      this.growth(Math.max(days, 7), client),
      this.dashboard.summary(),
      this.prisma.banAppeal.count({ where: { status: 'OPEN' } }),
      this.prisma.matchSearch.count({ where: { endedAt: null, startedAt: { lt: new Date(this.clock.now().getTime() - MS.minute), gt: new Date(this.clock.now().getTime() - 30 * MS.minute) } } }),
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(m."startedAt" + make_interval(mins => ${this.off}::int), 'YYYY-MM-DD') AS day, count(*) AS n
          FROM "Match" m JOIN "User" a ON a.id = m."userAId" JOIN "User" b ON b.id = m."userBId"
         WHERE m."startedAt" >= ${sw.from} AND m."endedAt" IS NOT NULL AND ${good} AND NOT a."isBot" AND NOT b."isBot"
           AND (${this.joined(client, 'a')} OR ${this.joined(client, 'b')}) GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(x.day + make_interval(mins => ${this.off}::int), 'YYYY-MM-DD') AS day, count(*) AS n
          FROM (SELECT DISTINCT act.uid, act.day FROM ${this.activity(sw.from, sw.to, client)} act) x JOIN "User" u ON u.id = x.uid
         WHERE NOT u."isBot" GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(u."createdAt" + make_interval(mins => ${this.off}::int), 'YYYY-MM-DD') AS day, count(*) AS n FROM "User" u
         WHERE NOT u."isBot" AND u."createdAt" >= ${sw.from} AND ${this.joined(client)} GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(p.completed_at + make_interval(mins => ${this.off}::int), 'YYYY-MM-DD') AS day, sum(p.usd_cents) AS n
          FROM "vw_real_payment" p JOIN "User" u ON u.id = p.user_id
         WHERE p.completed_at >= ${sw.from} AND ${this.joined(client)} GROUP BY 1`,
    ]);

    const pick = (rows: { day: string; n: bigint }[], day: string) => n(rows.find((r) => r.day === day)?.n);
    const daily: HealthReport['daily'] = [];
    for (let i = 0; i < series; i++) {
      const day = new Date(sw.from.getTime() + i * MS.day + this.off * MS.minute).toISOString().slice(0, 10);
      daily.push({ day, goodCalls: pick(dailyCalls, day), active: pick(dailyActive, day), signups: pick(dailySignups, day), revenueUsd: pick(dailyRevenue, day) / 100 });
    }

    const pair = (k: keyof Kpis): Pair => ({ cur: current[k], prev: previous[k] });
    const worst = matching.byHour.filter((h) => h.searches >= Math.max(5, matching.searches.total * 0.03) && h.avgWaitSec != null).sort((a, b) => (b.avgWaitSec ?? 0) - (a.avgWaitSec ?? 0))[0];
    const busiest = [...matching.byHour].sort((a, b) => b.searches - a.searches)[0];
    const notes = buildNotes({
      days,
      goodCalls: pair('goodCalls'),
      active: pair('active'),
      signups: pair('signups'),
      revenueUsd: pair('revenueUsd'),
      matching: {
        searches: matching.searches.total,
        gaveUpRate: matching.searches.gaveUpRate ?? 0,
        worstHour: worst ? { hour: worst.hour, avgWaitSec: worst.avgWaitSec ?? 0, searches: worst.searches } : null,
        busiestHour: busiest && busiest.searches ? { hour: busiest.hour, searches: busiest.searches } : null,
        calls: matching.calls.total,
        quickSkipRate: matching.calls.quickRate ?? 0,
        rematchSoon: matching.searches.rematchSoon,
      },
      sources: growth.sources.map((s) => ({ source: s.source, d1Rate: rate(s.cameBack, s.cameBackEligible) ?? 0, eligible: s.cameBackEligible })),
    });

    const q = summary.queues;
    const attention: HealthReport['attention'] = [];
    const add = (count: number, key: string, text: string, href: string, tone: 'bad' | 'warn' = 'warn') => {
      if (count > 0) attention.push({ key, text, href, tone });
    };
    add(waitingNow, 'waiting', `${waitingNow} ${waitingNow === 1 ? 'person has' : 'people have'} been waiting over a minute for a match`, '/matching', 'bad');
    add(q.cashoutsStuck, 'cashouts-stuck', `${q.cashoutsStuck} cash-out${q.cashoutsStuck === 1 ? '' : 's'} stuck over 30 minutes`, '/finance/cashouts', 'bad');
    add(q.openReports, 'reports', `${q.openReports} report${q.openReports === 1 ? '' : 's'} to review`, '/moderation', q.reportsToday >= 10 ? 'bad' : 'warn');
    add(appeals, 'appeals', `${appeals} appeal${appeals === 1 ? '' : 's'} waiting for an answer`, '/appeals');
    add(q.cashoutsReview, 'cashouts', `${q.cashoutsReview} cash-out${q.cashoutsReview === 1 ? '' : 's'} to approve`, '/finance/cashouts');
    add(q.pendingPurchases, 'payments', `${q.pendingPurchases} payment${q.pendingPurchases === 1 ? '' : 's'} waiting on the customer`, '/finance/purchases');
    add(q.partnersPending, 'partners', `${q.partnersPending} partner application${q.partnersPending === 1 ? '' : 's'}`, '/affiliates');
    add(q.partnerPayoutsOpen, 'partner-payouts', `${q.partnerPayoutsOpen} partner payout${q.partnerPayoutsOpen === 1 ? '' : 's'} to send`, '/affiliate-payouts');

    return { generatedAt: this.clock.now().toISOString(), days, client, current, previous, daily, notes, attention };
  }

  // ── Matching ──────────────────────────────────────────────────────────

  async matching(days: number): Promise<MatchingReport> {
    return this.redis.remember(`admin:insights:matching:${days}`, 60, () => this.buildMatching(days));
  }

  private async buildMatching(days: number): Promise<MatchingReport> {
    const w = this.window(days);
    const local = Prisma.sql`(s."startedAt" + make_interval(mins => ${this.off}::int))`;
    const [first, summary, cells, calls, reports] = await Promise.all([
      this.prisma.matchSearch.findFirst({ orderBy: { startedAt: 'asc' }, select: { startedAt: true } }),
      this.prisma.$queryRaw<{ total: bigint; matched: bigint; gave_up: bigint; avg: number | null; p50: number | null; p90: number | null; soon: bigint }[]>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE s.outcome = 'matched') AS matched,
               count(*) FILTER (WHERE s.outcome = 'gave_up') AS gave_up,
               avg(s."waitMs") FILTER (WHERE s.outcome = 'matched')::float / 1000 AS avg,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY s."waitMs") FILTER (WHERE s.outcome = 'matched') / 1000 AS p50,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY s."waitMs") FILTER (WHERE s.outcome = 'matched') / 1000 AS p90,
               count(*) FILTER (WHERE s."rematchSoon") AS soon
          FROM "MatchSearch" s JOIN "User" u ON u.id = s."userId"
         WHERE NOT u."isBot" AND s."startedAt" >= ${w.from} AND s."startedAt" < ${w.to}`,
      this.prisma.$queryRaw<{ dow: number; hour: number; n: bigint; wait: number | null; gave_up: bigint }[]>`
        SELECT extract(isodow FROM ${local})::int AS dow, extract(hour FROM ${local})::int AS hour, count(*) AS n,
               avg(s."waitMs") FILTER (WHERE s.outcome = 'matched')::float / 1000 AS wait,
               count(*) FILTER (WHERE s.outcome = 'gave_up') AS gave_up
          FROM "MatchSearch" s JOIN "User" u ON u.id = s."userId"
         WHERE NOT u."isBot" AND s."startedAt" >= ${w.from} AND s."startedAt" < ${w.to}
         GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ total: bigint; avg: number | null; quick: bigint; good: bigint }[]>`
        SELECT count(*) AS total, avg(extract(epoch FROM m."endedAt" - m."startedAt"))::float AS avg,
               count(*) FILTER (WHERE m."endedAt" - m."startedAt" < interval '10 seconds') AS quick,
               count(*) FILTER (WHERE m."endedAt" - m."startedAt" >= make_interval(secs => ${GOOD_CALL_SECONDS})) AS good
          FROM "Match" m JOIN "User" a ON a.id = m."userAId" JOIN "User" b ON b.id = m."userBId"
         WHERE m.kind = 'RANDOM' AND m."endedAt" IS NOT NULL AND m."startedAt" >= ${w.from} AND m."startedAt" < ${w.to} AND NOT a."isBot" AND NOT b."isBot"`,
      this.prisma.report.count({ where: { matchId: { not: null }, createdAt: { gte: w.from, lt: w.to } } }),
    ]);
    const s = summary[0];
    const c = calls[0];
    const total = n(s?.total);
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const rows = cells.filter((x) => x.hour === hour);
      const searches = rows.reduce((a, r) => a + n(r.n), 0);
      const gave = rows.reduce((a, r) => a + n(r.gave_up), 0);
      const waits = rows.filter((r) => r.wait != null);
      const avgWaitSec = waits.length ? waits.reduce((a, r) => a + (r.wait ?? 0) * n(r.n), 0) / waits.reduce((a, r) => a + n(r.n), 0) : null;
      return { hour, searches, avgWaitSec: avgWaitSec == null ? null : Math.round(avgWaitSec * 10) / 10, gaveUpRate: rate(gave, searches) };
    });
    const callTotal = n(c?.total);
    return {
      generatedAt: this.clock.now().toISOString(),
      days,
      collectingSince: first?.startedAt.toISOString() ?? null,
      searches: {
        total,
        matched: n(s?.matched),
        gaveUp: n(s?.gave_up),
        gaveUpRate: rate(n(s?.gave_up), total),
        avgWaitSec: s?.avg == null ? null : Math.round(s.avg * 10) / 10,
        p50WaitSec: s?.p50 == null ? null : Math.round(Number(s.p50) * 10) / 10,
        p90WaitSec: s?.p90 == null ? null : Math.round(Number(s.p90) * 10) / 10,
        rematchSoon: n(s?.soon),
      },
      heatmap: cells.map((x) => ({ dow: x.dow, hour: x.hour, searches: n(x.n), avgWaitSec: x.wait == null ? null : Math.round(x.wait * 10) / 10, gaveUp: n(x.gave_up) })),
      byHour,
      calls: {
        total: callTotal,
        avgSeconds: Math.round(c?.avg ?? 0),
        quick: n(c?.quick),
        quickRate: rate(n(c?.quick), callTotal),
        good: n(c?.good),
        goodRate: rate(n(c?.good), callTotal),
        reports,
        reportsPer100: callTotal ? Math.round((reports / callTotal) * 1000) / 10 : null,
      },
    };
  }

  // ── Growth ────────────────────────────────────────────────────────────

  async growth(days: number, client: ClientFilter): Promise<GrowthReport> {
    return this.redis.remember(`admin:insights:growth:${days}:${client}`, 60, () => this.buildGrowth(days, client));
  }

  private async buildGrowth(days: number, client: ClientFilter): Promise<GrowthReport> {
    const w = this.window(days);
    const now = this.clock.now();
    const today = this.clock.startOfDay(now);
    const cohortFrom = new Date(today.getTime() - 8 * 7 * MS.day);
    const [people, visitors, downloads, cohorts, perDay] = await Promise.all([
      this.prisma.$queryRaw<
        { source: string; signups: bigint; set_up: bigint; first_call: bigint; good_first: bigint; came_back: bigint; d1_eligible: bigint; week: bigint; week_eligible: bigint; paid: bigint }[]
      >`
        WITH s AS (
          SELECT u.id, u."createdAt", u."onboardedAt", ${this.dayOf('u."createdAt"')} AS sday,
                 -- No site visit and no invite = installed the app another way (shared APK, store): not "direct".
                 CASE WHEN r."affiliateId" IS NOT NULL THEN 'partner' WHEN r.id IS NOT NULL THEN 'invite' WHEN v.id IS NULL THEN 'no_site_visit' ELSE v.source END AS source
            FROM "User" u LEFT JOIN "Referral" r ON r."inviteeId" = u.id LEFT JOIN "SiteVisit" v ON v."userId" = u.id
           WHERE NOT u."isBot" AND u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to} AND ${this.joined(client)}
        ), act AS ${this.activity(w.from, now, 'all')}
        SELECT s.source, count(*) AS signups,
               count(*) FILTER (WHERE s."onboardedAt" IS NOT NULL) AS set_up,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "vw_real_call" c WHERE c.user_id = s.id)) AS first_call,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "vw_real_call" c WHERE c.user_id = s.id
                 AND c.started_at < s."createdAt" + interval '48 hours' AND c.seconds >= ${GOOD_CALL_SECONDS})) AS good_first,
               count(*) FILTER (WHERE s.sday + interval '1 day' <= ${today} AND EXISTS (SELECT 1 FROM act WHERE act.uid = s.id AND act.day = s.sday + interval '1 day')) AS came_back,
               count(*) FILTER (WHERE s.sday + interval '1 day' <= ${today}) AS d1_eligible,
               count(*) FILTER (WHERE s.sday + interval '7 days' <= ${today} AND EXISTS (SELECT 1 FROM act WHERE act.uid = s.id AND act.day >= s.sday + interval '7 days' AND act.day < s.sday + interval '14 days')) AS week,
               count(*) FILTER (WHERE s.sday + interval '7 days' <= ${today}) AS week_eligible,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "vw_real_payment" p WHERE p.user_id = s.id)) AS paid
          FROM s GROUP BY 1`,
      this.prisma.$queryRaw<{ source: string; n: bigint }[]>`
        SELECT v.source, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.from} AND v."startedAt" < ${w.to} GROUP BY 1`,
      this.prisma.$queryRaw<{ source: string | null; n: bigint }[]>`
        SELECT CASE WHEN d."visitId" IS NULL AND d.source = 'direct' THEN 'no_site_visit' ELSE d.source END AS source, count(*) AS n
          FROM "AppDownload" d WHERE d.at >= ${w.from} AND d.at < ${w.to} GROUP BY 1`,
      this.prisma.$queryRaw<{ week: string; signups: bigint; d1: bigint; d1e: bigint; d7: bigint; d7e: bigint; d30: bigint; d30e: bigint }[]>`
        WITH s AS (
          SELECT u.id, ${this.dayOf('u."createdAt"')} AS sday FROM "User" u
           WHERE NOT u."isBot" AND u."createdAt" >= ${cohortFrom} AND ${this.joined(client)}
        ), act AS ${this.activity(cohortFrom, now, 'all')}
        SELECT to_char(date_trunc('week', s.sday + make_interval(mins => ${this.off}::int)), 'YYYY-MM-DD') AS week, count(*) AS signups,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM act WHERE act.uid = s.id AND act.day = s.sday + interval '1 day')) AS d1,
               count(*) FILTER (WHERE s.sday + interval '1 day' <= ${today}) AS d1e,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM act WHERE act.uid = s.id AND act.day >= s.sday + interval '7 days' AND act.day < s.sday + interval '14 days')) AS d7,
               count(*) FILTER (WHERE s.sday + interval '7 days' <= ${today}) AS d7e,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM act WHERE act.uid = s.id AND act.day >= s.sday + interval '30 days' AND act.day < s.sday + interval '37 days')) AS d30,
               count(*) FILTER (WHERE s.sday + interval '30 days' <= ${today}) AS d30e
          FROM s GROUP BY 1 ORDER BY 1 DESC`,
      this.prisma.$queryRaw<{ day: string; app: bigint; web: bigint; total: bigint }[]>`
        SELECT to_char(u."createdAt" + make_interval(mins => ${this.off}::int), 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE u."signupClient" IN ('android', 'ios')) AS app,
               count(*) FILTER (WHERE u."signupClient" = 'web') AS web,
               count(*) AS total
          FROM "User" u
         WHERE NOT u."isBot" AND u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to} AND ${this.joined(client)} GROUP BY 1`,
    ]);

    const daily: GrowthReport['daily'] = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(w.from.getTime() + i * MS.day + this.off * MS.minute).toISOString().slice(0, 10);
      const r = perDay.find((x) => x.day === day);
      const [app, web, total] = [n(r?.app), n(r?.web), n(r?.total)];
      daily.push({ day, app, web, other: total - app - web, total });
    }

    const empty = (source: string): SourceRow => ({ source, visitors: 0, downloads: 0, signups: 0, setUp: 0, firstCall: 0, goodFirstCall: 0, cameBack: 0, cameBackEligible: 0, week: 0, weekEligible: 0, paid: 0 });
    const rows = new Map<string, SourceRow>();
    const row = (source: string) => rows.get(source) ?? rows.set(source, empty(source)).get(source)!;
    for (const p of people) {
      Object.assign(row(p.source), {
        signups: n(p.signups),
        setUp: n(p.set_up),
        firstCall: n(p.first_call),
        goodFirstCall: n(p.good_first),
        cameBack: n(p.came_back),
        cameBackEligible: n(p.d1_eligible),
        week: n(p.week),
        weekEligible: n(p.week_eligible),
        paid: n(p.paid),
      });
    }
    for (const v of visitors) row(v.source).visitors = n(v.n);
    for (const d of downloads) row(d.source ?? 'direct').downloads = n(d.n);
    const sources = [...rows.values()].sort((a, b) => b.signups - a.signups || b.visitors - a.visitors);
    const total = sources.reduce((t, r) => {
      for (const k of Object.keys(t) as (keyof SourceRow)[]) if (k !== 'source') (t[k] as number) += r[k] as number;
      return t;
    }, empty('all'));
    const ratio = (a: bigint, e: bigint) => (n(e) ? Math.round((n(a) / n(e)) * 1000) / 1000 : null);
    return {
      generatedAt: now.toISOString(),
      days,
      client,
      sources,
      total,
      daily,
      cohorts: cohorts.map((c) => ({ week: c.week, signups: n(c.signups), d1: ratio(c.d1, c.d1e), d7: ratio(c.d7, c.d7e), d30: ratio(c.d30, c.d30e) })),
    };
  }

  // ── Money ─────────────────────────────────────────────────────────────

  async money(days: number, client: ClientFilter): Promise<MoneyReport> {
    return this.redis.remember(`admin:insights:money:${days}:${client}`, 60, () => this.buildMoney(days, client));
  }

  private async buildMoney(days: number, client: ClientFilter): Promise<MoneyReport> {
    const w = this.window(days);
    const p = this.window(days, 1);
    const paidIn = (x: Window) => Prisma.sql`p.completed_at >= ${x.from} AND p.completed_at < ${x.to} AND ${this.joined(client)}`;
    const [totals, prev, active, firsts, products] = await Promise.all([
      this.prisma.$queryRaw<{ cents: bigint | null; purchases: bigint; payers: bigint; repeat: bigint }[]>`
        SELECT sum(x.cents) AS cents, sum(x.k) AS purchases, count(*) AS payers, count(*) FILTER (WHERE x.k >= 2) AS repeat
          FROM (SELECT p.user_id, sum(p.usd_cents) AS cents, count(*) AS k FROM "vw_real_payment" p JOIN "User" u ON u.id = p.user_id WHERE ${paidIn(w)} GROUP BY 1) x`,
      this.prisma.$queryRaw<{ cents: bigint | null }[]>`SELECT sum(p.usd_cents) AS cents FROM "vw_real_payment" p JOIN "User" u ON u.id = p.user_id WHERE ${paidIn(p)}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT act.uid) AS n FROM ${this.activity(w.from, w.to, 'all')} act JOIN "User" u ON u.id = act.uid WHERE NOT u."isBot" AND ${this.joined(client)}`,
      this.prisma.$queryRaw<{ n: bigint; median: number | null }[]>`
        SELECT count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM f.first - u."createdAt") / 86400) AS median
          FROM (SELECT p.user_id AS "userId", min(p.completed_at) AS first FROM "vw_real_payment" p GROUP BY 1) f
          JOIN "User" u ON u.id = f."userId"
         WHERE f.first >= ${w.from} AND f.first < ${w.to} AND ${this.joined(client)}`,
      this.prisma.$queryRaw<{ type: string; product: string; k: bigint; cents: bigint }[]>`
        SELECT p.product_type::text AS type, p.product_id AS product, count(*) AS k, sum(p.usd_cents) AS cents
          FROM "vw_real_payment" p JOIN "User" u ON u.id = p.user_id WHERE ${paidIn(w)} GROUP BY 1, 2 ORDER BY 4 DESC`,
    ]);
    const t = totals[0];
    const cents = n(t?.cents);
    const payers = n(t?.payers);
    const activePeople = n(active[0]?.n);
    return {
      generatedAt: this.clock.now().toISOString(),
      days,
      client,
      revenueUsd: cents / 100,
      purchases: n(t?.purchases),
      payers,
      activePeople,
      payingShare: rate(payers, activePeople),
      arppuUsd: payers ? Math.round(cents / payers) / 100 : null,
      firstTimePayers: n(firsts[0]?.n),
      medianDaysToFirstPurchase: firsts[0]?.median == null ? null : Math.round(Number(firsts[0].median) * 10) / 10,
      repeatPayers: n(t?.repeat),
      products: products.map((x) => ({ type: x.type, productId: x.product, purchases: n(x.k), revenueUsd: n(x.cents) / 100 })),
      previousRevenueUsd: n(prev[0]?.cents) / 100,
    };
  }

  // ── Store videos (rewarded ads) ───────────────────────────────────────

  async ads(days: number): Promise<AdsReport> {
    return this.redis.remember(`admin:insights:ads:${days}`, 60, () => this.buildAds(days));
  }

  private async buildAds(days: number): Promise<AdsReport> {
    const w = this.window(days);
    const p = this.window(days, 1);
    const [totals, prev, daily, platforms] = await Promise.all([
      this.prisma.$queryRaw<{ started: bigint; watched: bigint; paid: bigint; unpaid: bigint; coins: bigint | null; usd: Prisma.Decimal | null; people: bigint }[]>`
        SELECT count(*) AS started, count("watchedAt") AS watched, count("paidAt") AS paid,
               count(*) FILTER (WHERE valued = false) AS unpaid, sum(coins) AS coins, sum("estimatedUsd") AS usd,
               count(DISTINCT "userId") FILTER (WHERE "watchedAt" IS NOT NULL) AS people
          FROM "AdView" WHERE "createdAt" >= ${w.from} AND "createdAt" < ${w.to}`,
      this.prisma.$queryRaw<{ usd: Prisma.Decimal | null }[]>`SELECT sum("estimatedUsd") AS usd FROM "AdView" WHERE "createdAt" >= ${p.from} AND "createdAt" < ${p.to}`,
      this.prisma.$queryRaw<{ day: Date; started: bigint; watched: bigint; paid: bigint; usd: Prisma.Decimal | null }[]>`
        SELECT ${this.dayOf('"createdAt"')} AS day, count(*) AS started, count("watchedAt") AS watched, count("paidAt") AS paid, sum("estimatedUsd") AS usd
          FROM "AdView" WHERE "createdAt" >= ${w.from} AND "createdAt" < ${w.to} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ platform: string; started: bigint; paid: bigint; usd: Prisma.Decimal | null }[]>`
        SELECT platform, count(*) AS started, count("paidAt") AS paid, sum("estimatedUsd") AS usd
          FROM "AdView" WHERE "createdAt" >= ${w.from} AND "createdAt" < ${w.to} GROUP BY 1 ORDER BY 2 DESC`,
    ]);
    const t = totals[0];
    const usd = (v: Prisma.Decimal | null | undefined) => Math.round(Number(v ?? 0) * 10_000) / 10_000;
    const key = (at: Date) => new Date(at.getTime() + this.off * MS.minute).toISOString().slice(0, 10);
    const byDay = new Map(daily.map((d) => [key(new Date(d.day)), d]));
    const series: AdsReport['daily'] = [];
    for (let i = 0; i < days; i++) {
      const day = key(new Date(w.from.getTime() + i * MS.day));
      const d = byDay.get(day);
      series.push({ day, started: n(d?.started), watched: n(d?.watched), paid: n(d?.paid), estimatedUsd: usd(d?.usd) });
    }
    return {
      generatedAt: this.clock.now().toISOString(),
      days,
      started: n(t?.started),
      watched: n(t?.watched),
      paid: n(t?.paid),
      unpaidByNetwork: n(t?.unpaid),
      coinsGiven: n(t?.coins),
      estimatedUsd: usd(t?.usd),
      previousEstimatedUsd: usd(prev[0]?.usd),
      people: n(t?.people),
      daily: series,
      byPlatform: platforms.map((x) => ({ platform: x.platform, started: n(x.started), paid: n(x.paid), estimatedUsd: usd(x.usd) })),
    };
  }
}
