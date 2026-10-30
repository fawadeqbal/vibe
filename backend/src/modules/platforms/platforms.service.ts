import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CLIENT_KINDS, ClientKind } from './client-kind';

type ByClient = Record<ClientKind, number>;
const zero = (): ByClient => ({ android: 0, ios: 0, web: 0 });

export interface PlatformsReport {
  days: number;
  generatedAt: string;
  /** New accounts in the window, by where they were made (`unknown` = before tracking). */
  signups: ByClient & { unknown: number };
  /** All accounts ever, by where they were made. */
  signupsAllTime: ByClient & { unknown: number };
  /** People active today / in the window, by client (someone on both counts once in each). */
  activeToday: ByClient;
  activeInWindow: ByClient;
  /** Per business day: sign-ups and active people by client. */
  daily: { day: string; signups: ByClient; active: ByClient }[];
  downloads: {
    /** "Download for Android" presses on the marketing site, in the window. */
    inWindow: number;
    allTime: number;
    bySource: { source: string; downloads: number }[];
    /** GitHub's own count of APK downloads (all releases), null if GitHub didn't answer. */
    github: number | null;
  };
}

/**
 * "How many use the app vs the web": where each account was made, who was
 * active on which client each day, and Android APK downloads.
 */
@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  /** Counts someone as active on this client today (one write per person, client and day). */
  async noteActive(userId: string, client: ClientKind): Promise<void> {
    const day = this.clock.startOfDay();
    const fresh = await this.redis.client.set(`act:${day.getTime()}:${client}:${userId}`, '1', 'EX', 2 * 24 * 3600, 'NX');
    if (!fresh) return;
    await this.prisma.clientActivity.createMany({ data: [{ day, userId, client }], skipDuplicates: true });
  }

  async report(days: number): Promise<PlatformsReport> {
    return this.redis.remember(`admin:platforms:${days}`, 60, () => this.build(days));
  }

  private async build(days: number): Promise<PlatformsReport> {
    const now = this.clock.now();
    const today = this.clock.startOfDay(now);
    const since = new Date(today.getTime() - (days - 1) * MS.day);
    const off = Math.trunc(this.config.get('BUSINESS_TZ_OFFSET_MINUTES'));
    const realUser = Prisma.sql`u."isBot" = false`;

    const [signupsWin, signupsAll, activeToday, activeWin, dailySignups, dailyActive, dlWin, dlAll, dlSources, github] = await Promise.all([
      this.prisma.$queryRaw<{ client: string | null; n: bigint }[]>`SELECT u."signupClient" AS client, count(*) AS n FROM "User" u WHERE ${realUser} AND u."createdAt" >= ${since} GROUP BY 1`,
      this.prisma.$queryRaw<{ client: string | null; n: bigint }[]>`SELECT u."signupClient" AS client, count(*) AS n FROM "User" u WHERE ${realUser} GROUP BY 1`,
      this.prisma.$queryRaw<{ client: string; n: bigint }[]>`SELECT a.client, count(*) AS n FROM "ClientActivity" a WHERE a.day = ${today} GROUP BY 1`,
      this.prisma.$queryRaw<{ client: string; n: bigint }[]>`SELECT a.client, count(DISTINCT a."userId") AS n FROM "ClientActivity" a WHERE a.day >= ${since} GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; client: string | null; n: bigint }[]>`
        SELECT to_char((u."createdAt" + make_interval(mins => ${off}::int))::date, 'YYYY-MM-DD') AS day, u."signupClient" AS client, count(*) AS n
          FROM "User" u WHERE ${realUser} AND u."createdAt" >= ${since} GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ day: string; client: string; n: bigint }[]>`
        SELECT to_char((a.day + make_interval(mins => ${off}::int))::date, 'YYYY-MM-DD') AS day, a.client, count(*) AS n
          FROM "ClientActivity" a WHERE a.day >= ${since} GROUP BY 1, 2`,
      this.prisma.appDownload.count({ where: { at: { gte: since } } }),
      this.prisma.appDownload.count(),
      this.prisma.appDownload.groupBy({ by: ['source'], where: { at: { gte: since } }, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 10 }),
      this.githubDownloads(),
    ]);

    const tally = (rows: { client: string | null; n: bigint }[]) => {
      const out = { ...zero(), unknown: 0 };
      for (const r of rows) {
        const k = r.client && (CLIENT_KINDS as string[]).includes(r.client) ? (r.client as ClientKind) : 'unknown';
        out[k] += Number(r.n);
      }
      return out;
    };
    const byClient = (rows: { client: string; n: bigint }[]) => {
      const { unknown: _u, ...rest } = tally(rows);
      return rest;
    };

    const daily: PlatformsReport['daily'] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * MS.day + off * 60_000).toISOString().slice(0, 10);
      daily.push({ day: d, signups: zero(), active: zero() });
    }
    const at = (day: string) => daily.find((d) => d.day === day);
    for (const r of dailySignups) {
      const row = at(r.day);
      const k = (CLIENT_KINDS as string[]).includes(r.client ?? '') ? (r.client as ClientKind) : null;
      if (row && k) row.signups[k] += Number(r.n);
    }
    for (const r of dailyActive) {
      const row = at(r.day);
      if (row && (CLIENT_KINDS as string[]).includes(r.client)) row.active[r.client as ClientKind] += Number(r.n);
    }

    return {
      days,
      generatedAt: now.toISOString(),
      signups: tally(signupsWin),
      signupsAllTime: tally(signupsAll),
      activeToday: byClient(activeToday),
      activeInWindow: byClient(activeWin),
      daily,
      downloads: {
        inWindow: dlWin,
        allTime: dlAll,
        bySource: dlSources.map((s) => ({ source: s.source ?? 'direct', downloads: s._count._all })),
        github,
      },
    };
  }

  /** GitHub's download count for every APK in the app's releases (cached 10 min). */
  private async githubDownloads(): Promise<number | null> {
    const repo = this.config.get('APP_RELEASES_REPO');
    if (!repo) return null;
    try {
      return await this.redis.remember(`gh:apk-downloads:${repo}`, 600, async () => {
        const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'vibe-api' }, signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const releases = (await res.json()) as { assets?: { name: string; download_count: number }[] }[];
        return releases.flatMap((r) => r.assets ?? []).filter((a) => a.name.endsWith('.apk')).reduce((n, a) => n + a.download_count, 0);
      });
    } catch (e) {
      this.logger.warn(`GitHub download count: ${(e as Error).message}`);
      return null;
    }
  }
}
