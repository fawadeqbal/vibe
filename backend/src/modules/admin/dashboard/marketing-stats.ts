import type { Prisma } from '@prisma/client';

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
  /** "Download for Android" presses (the counted APK link). */
  downloads: number;
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
  const downloads = prisma.appDownload.count({ where: { at: { gte: from, lt: to } } });
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
    downloads: await downloads,
  };
}

/** What a visit ended in: signed up › clicked into the app › still reading (last 5 min) › left. */
export type VisitOutcome = 'signed_up' | 'clicked' | 'reading' | 'left';
const outcome = (v: { userId: string | null; clicks: number; lastAt: Date }, fresh: number): VisitOutcome =>
  v.userId ? 'signed_up' : v.clicks > 0 ? 'clicked' : v.lastAt.getTime() >= fresh ? 'reading' : 'left';

export interface MarketingVisit {
  at: string;
  startedAt: string;
  country: string | null;
  region: string | null;
  city: string | null;
  source: string;
  medium: string;
  campaign: string | null;
  path: string;
  device: string;
  os: string;
  browser: string;
  pages: number;
  seconds: number;
  did: VisitOutcome;
  button: string | null;
}

export interface MarketingVisitsPage {
  items: MarketingVisit[];
  total: number;
  page: number;
  pageSize: number;
  /** Visits in the window by outcome (the filter chips). */
  counts: Record<VisitOutcome | 'all', number>;
  /** Channels seen in the window (the channel filter). */
  sources: string[];
}

/** Admin → Marketing site → All visits: every visit in the window, newest first, a page at a time. */
export async function marketingVisits(
  prisma: PrismaService,
  q: { days: number; page: number; pageSize: number; did?: VisitOutcome; source?: string; q?: string },
  now: Date,
): Promise<MarketingVisitsPage> {
  const since = new Date(now.getTime() - q.days * 86_400_000);
  const fresh = new Date(now.getTime() - 5 * 60_000);
  const window: Prisma.SiteVisitWhereInput = { startedAt: { gte: since, lt: now } };
  const byDid: Record<VisitOutcome, Prisma.SiteVisitWhereInput> = {
    signed_up: { userId: { not: null } },
    clicked: { userId: null, clicks: { gt: 0 } },
    reading: { userId: null, clicks: 0, lastAt: { gte: fresh } },
    left: { userId: null, clicks: 0, lastAt: { lt: fresh } },
  };
  const text = q.q?.trim();
  const where: Prisma.SiteVisitWhereInput = {
    AND: [
      window,
      q.did ? byDid[q.did] : {},
      q.source ? { source: q.source } : {},
      text
        ? { OR: [{ city: { contains: text, mode: 'insensitive' } }, { region: { contains: text, mode: 'insensitive' } }, { country: { equals: text.toUpperCase() } }, { landingPath: { contains: text, mode: 'insensitive' } }] }
        : {},
    ],
  };
  const [rows, total, all, signed, clicked, reading, sources] = await Promise.all([
    prisma.siteVisit.findMany({
      where,
      orderBy: [{ lastAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { lastAt: true, startedAt: true, country: true, region: true, city: true, source: true, medium: true, campaign: true, landingPath: true, device: true, os: true, browser: true, pages: true, seconds: true, clicks: true, userId: true, lastButton: true },
    }),
    prisma.siteVisit.count({ where }),
    prisma.siteVisit.count({ where: window }),
    prisma.siteVisit.count({ where: { AND: [window, byDid.signed_up] } }),
    prisma.siteVisit.count({ where: { AND: [window, byDid.clicked] } }),
    prisma.siteVisit.count({ where: { AND: [window, byDid.reading] } }),
    prisma.siteVisit.groupBy({ by: ['source'], where: window, _count: { _all: true }, orderBy: { _count: { source: 'desc' } } }),
  ]);
  return {
    items: rows.map((v) => ({
      at: v.lastAt.toISOString(),
      startedAt: v.startedAt.toISOString(),
      country: v.country,
      region: v.region,
      city: v.city,
      source: v.source,
      medium: v.medium,
      campaign: v.campaign,
      path: v.landingPath,
      device: v.device,
      os: v.os,
      browser: v.browser,
      pages: v.pages,
      seconds: v.seconds,
      did: outcome(v, fresh.getTime()),
      button: v.lastButton,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    counts: { all, signed_up: signed, clicked, reading, left: all - signed - clicked - reading },
    sources: sources.map((s) => s.source),
  };
}

/** Every business day from `from` to `to` (YYYY-MM-DD), so quiet days show as 0 on the chart. */
function everyDay(from: Date, to: Date, off: number): string[] {
  const day = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(0, 10);
  const out: string[] = [];
  for (let t = new Date(`${day(from)}T00:00:00Z`).getTime(), end = new Date(`${day(to)}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
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
        FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 200`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`
      SELECT v.country AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 250`,
    prisma.$queryRaw<{ country: string | null; name: string | null; n: bigint }[]>`
      SELECT v.country, v.region AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} AND v.region IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 1000`,
    prisma.$queryRaw<{ city: string; country: string | null; n: bigint }[]>`
      SELECT v.city, v.country, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} AND v.city IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 200`,
    prisma.$queryRaw<{ button: string; target: string | null; clicks: bigint; signups: bigint }[]>`
      SELECT e.button, max(e.target) AS target, count(*) AS clicks,
             (SELECT count(*) FROM "SiteVisit" s WHERE s."lastButton" = e.button AND s."userId" IS NOT NULL AND s."startedAt" >= ${w.since} AND s."startedAt" < ${w.now}) AS signups
        FROM "SiteEvent" e WHERE e.kind = 'CLICK' AND e.button IS NOT NULL AND e.at >= ${w.since} AND e.at < ${w.now} GROUP BY 1 ORDER BY 3 DESC LIMIT 200`,
    prisma.$queryRaw<{ path: string; visits: bigint; clicked: bigint }[]>`
      SELECT v."landingPath" AS path, count(*) AS visits, count(*) FILTER (WHERE v.clicks > 0) AS clicked FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 500`,
    prisma.$queryRaw<{ campaign: string; source: string; medium: string; visitors: bigint; signups: bigint }[]>`
      SELECT v.campaign, v.source, v.medium, count(DISTINCT v."visitorId") AS visitors, count(v."userId") AS signups FROM "SiteVisit" v
       WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} AND v.campaign IS NOT NULL GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 200`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.device AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.os AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.browser AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.$queryRaw<{ name: string | null; n: bigint }[]>`SELECT v.lang AS name, count(DISTINCT v."visitorId") AS n FROM "SiteVisit" v WHERE v."startedAt" >= ${w.since} AND v."startedAt" < ${w.now} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.siteVisit.count({ where: { lastAt: { gte: new Date(now.getTime() - 5 * 60_000) } } }),
    prisma.siteVisit.findMany({
      orderBy: { lastAt: 'desc' },
      take: 10,
      select: { lastAt: true, country: true, region: true, city: true, source: true, landingPath: true, userId: true, clicks: true, lastButton: true },
    }),
  ]);

  const fresh = now.getTime() - 5 * 60_000;
  return {
    days,
    generatedAt: now.toISOString(),
    siteUrl,
    totals: cur,
    previous: prev,
    daily: everyDay(since, now, off).map((day) => {
      const d = daily.find((x) => x.day === day);
      return { day, visitors: num(d?.visitors), clicked: num(d?.clicked), signups: num(d?.signups) };
    }),
    sources: sources.map((s) => ({ source: s.source, medium: s.medium, visitors: num(s.visitors), clicked: num(s.clicked), signups: num(s.signups) })),
    countries: countries.map((c) => ({
      country: c.name ?? 'Unknown',
      visitors: num(c.n),
      regions: regions.filter((r) => (r.country ?? 'Unknown') === (c.name ?? 'Unknown')).map((r) => ({ name: r.name ?? 'Unknown', visitors: num(r.n) })),
    })),
    cities: cities.map((c) => ({ city: c.city, country: c.country, visitors: num(c.n) })),
    buttons: buttons.map((b) => ({ button: b.button, target: b.target, clicks: num(b.clicks), signups: num(b.signups) })),
    pages: pages.map((p) => ({ path: p.path, visits: num(p.visits), clicked: num(p.clicked) })),
    campaigns: campaigns.map((c) => ({ campaign: c.campaign, source: c.source, medium: c.medium, visitors: num(c.visitors), signups: num(c.signups) })),
    devices: { device: named(device), os: named(os), browser: named(browser), lang: named(lang) },
    live: {
      now: liveNow,
      recent: recent.map((v) => ({ at: v.lastAt.toISOString(), country: v.country, region: v.region, city: v.city, source: v.source, path: v.landingPath, did: outcome(v, fresh), button: v.lastButton })),
    },
  };
}
