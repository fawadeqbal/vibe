import type { PrismaService } from '../../../infra/prisma/prisma.service';

export interface MarketingTotals {
  /** Distinct browsers. */
  visitors: number;
  visits: number;
  pageViews: number;
  /** Visits that pressed a "go to the app" button. */
  clickedVisits: number;
  clicks: number;
  /** Accounts made from a site visit. */
  signups: number;
  /** Of those, how many have had a call (random or friend). */
  firstCalls: number;
  /** Median time on site per visit, seconds (visits that reported one). */
  medianSeconds: number;
}

type Named = { name: string; visitors: number };

export interface MarketingReport {
  days: number;
  generatedAt: string;
  /** The marketing site's address (for "ignore my visits"). */
  siteUrl: string;
  totals: MarketingTotals;
  /** The same window just before, for the ▲/▼ next to each number. */
  previous: MarketingTotals;
  daily: { day: string; visitors: number; clicked: number; signups: number }[];
  sources: { source: string; medium: string; visitors: number; clicked: number; signups: number }[];
  countries: { country: string; visitors: number; regions: Named[] }[];
  cities: { city: string; country: string | null; visitors: number }[];
  buttons: { button: string; target: string | null; clicks: number; signups: number }[];
  pages: { path: string; visits: number; clicked: number }[];
  campaigns: { campaign: string; source: string; medium: string; visitors: number; signups: number }[];
  devices: { device: Named[]; os: Named[]; browser: Named[]; lang: Named[] };
  live: {
    /** Visits active in the last 5 minutes. */
    now: number;
    recent: { at: string; country: string | null; region: string | null; city: string | null; source: string; path: string; did: 'reading' | 'clicked' | 'signed_up' | 'left'; button: string | null }[];
  };
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

async function totals(prisma: PrismaService, from: Date, to: Date): Promise<MarketingTotals> {
  const [r] = await prisma.$queryRaw<
    { visitors: bigint; visits: bigint; pages: bigint; clicked: bigint; clicks: bigint; signups: bigint; first_calls: bigint; median: number | null }[]
  >`
    SELECT count(DISTINCT v."visitorId") AS visitors,
           count(*) AS visits,
           COALESCE(sum(v.pages), 0) AS pages,
           count(*) FILTER (WHERE v.clicks > 0) AS clicked,
           COALESCE(sum(v.clicks), 0) AS clicks,
           count(v."userId") AS signups,
           count(v."userId") FILTER (WHERE EXISTS (SELECT 1 FROM "Match" m WHERE m."userAId" = v."userId" OR m."userBId" = v."userId")) AS first_calls,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY v.seconds) FILTER (WHERE v.seconds > 0) AS median
      FROM "SiteVisit" v
     WHERE v."startedAt" >= ${from} AND v."startedAt" < ${to}`;
  return {
    visitors: num(r?.visitors),
    visits: num(r?.visits),
    pageViews: num(r?.pages),
    clickedVisits: num(r?.clicked),
    clicks: num(r?.clicks),
    signups: num(r?.signups),
    firstCalls: num(r?.first_calls),
    medianSeconds: Math.round(r?.median ?? 0),
  };
}

const named = (rows: { name: string | null; n: bigint }[]): Named[] => rows.map((r) => ({ name: r.name ?? 'Unknown', visitors: num(r.n) }));

/** Marketing-site traffic for the last `days` days (admin → Marketing site). */
export async function marketingReport(prisma: PrismaService, days: number, now: Date, tzOffsetMinutes: number, siteUrl: string): Promise<MarketingReport> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const before = new Date(since.getTime() - days * 86_400_000);
  const off = Math.trunc(tzOffsetMinutes);
  const w = { since, now };

  const [cur, prev, daily, sources, countries, regions, cities, buttons, pages, campaigns, device, os, browser, lang, liveNow, recent] = await Promise.all([
    totals(prisma, since, now),
    totals(prisma, before, since),
    prisma.$queryRaw<{ day: string; visitors: bigint; clicked: bigint; signups: bigint }[]>`
      SELECT to_char((v."startedAt" + make_interval(mins => ${off}::int))::date, 'YYYY-MM-DD') AS day,
             count(DISTINCT v."visitorId") AS visitors, count(*) FILTER (WHERE v.clicks > 0) AS clicked, count(v."userId") AS signups
        FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ source: string; medium: string; visitors: bigint; clicked: bigint; signups: bigint }[]>`
      SELECT v.source, v.medium, count(DISTINCT v."visitorId") AS visitors, count(*) FILTER (WHERE v.clicks > 0) AS clicked, count(v."userId") AS signups
        FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`
      SELECT v.country AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    prisma.$queryRaw<{ country: string | null; name: string | null; n: bigint }[]>`
      SELECT v.country, v.region AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} AND v.region IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 200`,
    prisma.$queryRaw<{ city: string; country: string | null; n: bigint }[]>`
      SELECT v.city, v.country, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} AND v.city IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`,
    prisma.$queryRaw<{ button: string; target: string | null; clicks: bigint; signups: bigint }[]>`
      SELECT e.button, max(e.target) AS target, count(*) AS clicks,
             (SELECT count(*) FROM "SiteVisit" s WHERE s."lastButton" = e.button AND s."userId" IS NOT NULL AND s."startedAt" >= ${w.since} AND s."startedAt" < ${w.now}) AS signups
        FROM "SiteEvent" e WHERE e.kind = 'CLICK' AND e.button IS NOT NULL AND e.at >= ${w.since} AND e.at < ${w.now} GROUP BY 1 ORDER BY 3 DESC LIMIT 30`,
    prisma.$queryRaw<{ path: string; visits: bigint; clicked: bigint }[]>`
      SELECT v."landingPath" AS path, count(*) AS visits, count(*) FILTER (WHERE v.clicks > 0) AS clicked FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
    prisma.$queryRaw<{ campaign: string; source: string; medium: string; visitors: bigint; signups: bigint }[]>`
      SELECT v.campaign, v.source, v.medium, count(DISTINCT v."visitorId") AS visitors, count(v."userId") AS signups FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} AND v.campaign IS NOT NULL GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.device AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.os AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.browser AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.lang AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.siteVisit.count({ where: { lastAt: { gte: new Date(now.getTime() - 5 * 60_000) } } }),
    prisma.siteVisit.findMany({
      orderBy: { lastAt: 'desc' },
      take: 20,
      select: { lastAt: true, country: true, region: true, city: true, source: true, landingPath: true, userId: true, lastButton: true, events: { orderBy: { at: 'desc' }, take: 1, select: { kind: true, path: true, button: true } } },
    }),
  ]);

  const fresh = now.getTime() - 5 * 60_000;
  return {
    days,
    generatedAt: now.toISOString(),
    siteUrl,
    totals: cur,
    previous: prev,
    daily: daily.map((d) => ({ day: d.day, visitors: num(d.visitors), clicked: num(d.clicked), signups: num(d.signups) })),
    sources: sources.map((s) => ({ source: s.source, medium: s.medium, visitors: num(s.visitors), clicked: num(s.clicked), signups: num(s.signups) })),
    countries: countries.map((c) => ({
      country: c.name ?? 'Unknown',
      visitors: num(c.n),
      regions: regions.filter((r) => (r.country ?? 'Unknown') === (c.name ?? 'Unknown')).slice(0, 6).map((r) => ({ name: r.name ?? 'Unknown', visitors: num(r.n) })),
    })),
    cities: cities.map((c) => ({ city: c.city, country: c.country, visitors: num(c.n) })),
    buttons: buttons.map((b) => ({ button: b.button, target: b.target, clicks: num(b.clicks), signups: num(b.signups) })),
    pages: pages.map((p) => ({ path: p.path, visits: num(p.visits), clicked: num(p.clicked) })),
    campaigns: campaigns.map((c) => ({ campaign: c.campaign, source: c.source, medium: c.medium, visitors: num(c.visitors), signups: num(c.signups) })),
    devices: { device: named(device), os: named(os), browser: named(browser), lang: named(lang) },
    live: {
      now: liveNow,
      recent: recent.map((v) => {
        const last = v.events[0];
        const did = v.userId ? 'signed_up' : last?.kind === 'CLICK' ? 'clicked' : v.lastAt.getTime() >= fresh ? 'reading' : 'left';
        return { at: v.lastAt.toISOString(), country: v.country, region: v.region, city: v.city, source: v.source, path: last?.path ?? v.landingPath, did, button: last?.kind === 'CLICK' ? (last.button ?? v.lastButton) : null };
      }),
    },
  };
}
