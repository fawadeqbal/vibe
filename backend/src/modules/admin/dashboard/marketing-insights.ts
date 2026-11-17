import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { WORLD_REGIONS, worldRegion } from './world-regions';

/**
 * Admin → Marketing insights: the same visit counts as the Marketing site
 * page (vw_site_visit), split by world region and country, channel, device
 * and local hour of day, each with the same window just before. One query
 * with GROUPING SETS does every split for both windows.
 *
 * A visit counts in the window it started in; what it led to (sign-up, first
 * call, paying, revenue) counts however long after.
 */
export interface InsightCounts {
  /** Distinct browsers. For a region, the sum of its countries (a browser seen in two countries counts twice). */
  visitors: number;
  visits: number;
  /** Visits that pressed a "go to the app" button. */
  clicked: number;
  /** Visits that ended in a real account. */
  signups: number;
  /** …that have had a random call with a real person. */
  firstCalls: number;
  /** …that made a real (non-test, non-refunded) purchase. */
  paid: number;
  /** Everything those people have paid, in US cents. */
  revenueCents: number;
}

export interface InsightRow extends InsightCounts {
  key: string;
  before: InsightCounts;
}

export interface MarketingInsights {
  days: number;
  generatedAt: string;
  /** The business time zone the hours are in, minutes east of UTC. */
  tzOffsetMinutes: number;
  totals: InsightCounts;
  previous: InsightCounts;
  daily: ({ day: string } & InsightCounts)[];
  /** The eight world regions with visits (and 'Unknown'), each with its countries (ISO codes). */
  regions: (InsightRow & { countries: InsightRow[] })[];
  /** By source (google, tiktok, direct…). */
  channels: InsightRow[];
  /** Android, iPhone, Tablet, Desktop, Other phone. */
  devices: InsightRow[];
  /** Always 24 rows, key '00'…'23', business time. */
  hours: InsightRow[];
  /** Visits active in the last 5 minutes. */
  live: number;
}

type Raw = {
  cur: boolean;
  country: string | null;
  source: string | null;
  device: string | null;
  hour: number | null;
  g: number;
  visitors: bigint;
  visits: bigint;
  clicked: bigint;
  signups: bigint;
  first_calls: bigint;
  paid: bigint;
  cents: bigint | number | null;
};

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const zero = (): InsightCounts => ({
  visitors: 0,
  visits: 0,
  clicked: 0,
  signups: 0,
  firstCalls: 0,
  paid: 0,
  revenueCents: 0,
});
const counts = (r: Omit<Raw, 'cur' | 'country' | 'source' | 'device' | 'hour' | 'g'>): InsightCounts => ({
  visitors: num(r.visitors),
  visits: num(r.visits),
  clicked: num(r.clicked),
  signups: num(r.signups),
  firstCalls: num(r.first_calls),
  paid: num(r.paid),
  revenueCents: num(r.cents),
});
const add = (a: InsightCounts, b: InsightCounts): InsightCounts => ({
  visitors: a.visitors + b.visitors,
  visits: a.visits + b.visits,
  clicked: a.clicked + b.clicked,
  signups: a.signups + b.signups,
  firstCalls: a.firstCalls + b.firstCalls,
  paid: a.paid + b.paid,
  revenueCents: a.revenueCents + b.revenueCents,
});

const strip = ({
  visitors,
  visits,
  clicked,
  signups,
  firstCalls,
  paid,
  revenueCents,
}: InsightCounts): InsightCounts => ({ visitors, visits, clicked, signups, firstCalls, paid, revenueCents });

/** GROUPING(country, source, device, hour): a bit is 1 when that column is NOT in the set. */
const SET = { total: 15, country: 7, source: 11, device: 13, hour: 14 } as const;

/** Rows of one split, both windows side by side, biggest first. */
function split(raw: Raw[], g: number, key: (r: Raw) => string): InsightRow[] {
  const by = new Map<string, InsightRow>();
  for (const r of raw) {
    if (r.g !== g) continue;
    const k = key(r);
    const row = by.get(k) ?? { key: k, ...zero(), before: zero() };
    if (r.cur) Object.assign(row, counts(r));
    else row.before = counts(r);
    by.set(k, row);
  }
  return [...by.values()].sort(
    (a, b) => b.visitors - a.visitors || b.before.visitors - a.before.visitors || a.key.localeCompare(b.key),
  );
}

function everyDay(from: Date, to: Date, off: number): string[] {
  const day = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(0, 10);
  const out: string[] = [];
  for (
    let t = new Date(`${day(from)}T00:00:00Z`).getTime(), end = new Date(`${day(to)}T00:00:00Z`).getTime();
    t <= end;
    t += 86_400_000
  )
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export async function marketingInsights(
  prisma: PrismaService,
  days: number,
  now: Date,
  tzOffsetMinutes: number,
): Promise<MarketingInsights> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const before = new Date(since.getTime() - days * 86_400_000);
  const off = Math.trunc(tzOffsetMinutes);

  const [raw, daily, live] = await Promise.all([
    prisma.$queryRaw<Raw[]>`
      WITH pay AS (SELECT p.user_id, sum(p.usd_cents) AS cents FROM "vw_real_payment" p GROUP BY 1),
      v AS (
        SELECT (v.started_at >= ${since}) AS cur, v.visitor_id, v.country, v.source,
               CASE WHEN v.device = 'computer' THEN 'Desktop'
                    WHEN v.device = 'tablet' THEN 'Tablet'
                    WHEN v.os = 'Android' THEN 'Android'
                    WHEN v.os = 'iOS' THEN 'iPhone'
                    ELSE 'Other phone' END AS device,
               extract(hour FROM v.started_at + make_interval(mins => ${off}::int))::int AS hour,
               v.clicked, v.signed_up, v.had_call, v.paid, COALESCE(pay.cents, 0) AS cents
          FROM "vw_site_visit" v
          LEFT JOIN pay ON pay.user_id = v.user_id
         WHERE v.started_at >= ${before} AND v.started_at < ${now}
      )
      SELECT cur, country, source, device, hour,
             GROUPING(country, source, device, hour)::int AS g,
             count(DISTINCT visitor_id)             AS visitors,
             count(*)                               AS visits,
             count(*) FILTER (WHERE clicked)        AS clicked,
             count(*) FILTER (WHERE signed_up)      AS signups,
             count(*) FILTER (WHERE had_call)       AS first_calls,
             count(*) FILTER (WHERE paid)           AS paid,
             COALESCE(sum(cents), 0)::bigint        AS cents
        FROM v
       GROUP BY GROUPING SETS ((cur), (cur, country), (cur, source), (cur, device), (cur, hour))`,
    prisma.$queryRaw<(Omit<Raw, 'cur' | 'country' | 'source' | 'device' | 'hour' | 'g'> & { day: string })[]>`
      WITH pay AS (SELECT p.user_id, sum(p.usd_cents) AS cents FROM "vw_real_payment" p GROUP BY 1)
      SELECT to_char((v.started_at + make_interval(mins => ${off}::int))::date, 'YYYY-MM-DD') AS day,
             count(DISTINCT v.visitor_id) AS visitors, count(*) AS visits,
             count(*) FILTER (WHERE v.clicked) AS clicked, count(*) FILTER (WHERE v.signed_up) AS signups,
             count(*) FILTER (WHERE v.had_call) AS first_calls, count(*) FILTER (WHERE v.paid) AS paid,
             COALESCE(sum(pay.cents), 0)::bigint AS cents
        FROM "vw_site_visit" v
        LEFT JOIN pay ON pay.user_id = v.user_id
       WHERE v.started_at >= ${since} AND v.started_at < ${now}
       GROUP BY 1 ORDER BY 1`,
    prisma.siteVisit.count({ where: { lastAt: { gte: new Date(now.getTime() - 5 * 60_000) } } }),
  ]);

  const total = split(raw, SET.total, () => 'all')[0];
  const countries = split(raw, SET.country, (r) => r.country ?? 'Unknown');
  const order = [...WORLD_REGIONS, 'Unknown'];
  const regions = order
    .map((name) => {
      const list = countries.filter((c) => worldRegion(c.key === 'Unknown' ? null : c.key) === name);
      const sum = list.reduce((a, c) => add(a, c), zero());
      const prev = list.reduce((a, c) => add(a, c.before), zero());
      return { key: name, ...sum, before: prev, countries: list };
    })
    .filter((r) => r.countries.length > 0)
    .sort((a, b) => b.visitors - a.visitors || b.before.visitors - a.before.visitors);
  const byHour = new Map(split(raw, SET.hour, (r) => String(r.hour ?? 0).padStart(2, '0')).map((r) => [r.key, r]));

  return {
    days,
    generatedAt: now.toISOString(),
    tzOffsetMinutes: off,
    totals: total ? strip(total) : zero(),
    previous: total ? total.before : zero(),
    daily: everyDay(since, now, off).map((day) => {
      const d = daily.find((x) => x.day === day);
      return { day, ...(d ? counts(d) : zero()) };
    }),
    regions,
    channels: split(raw, SET.source, (r) => r.source ?? 'unknown'),
    devices: split(raw, SET.device, (r) => r.device ?? 'Other phone'),
    hours: Array.from({ length: 24 }, (_, h) => {
      const k = String(h).padStart(2, '0');
      return byHour.get(k) ?? { key: k, ...zero(), before: zero() };
    }),
    live,
  };
}
