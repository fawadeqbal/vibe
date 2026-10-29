import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SiteEventKind } from '@prisma/client';
import { z } from 'zod';

import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { classifySource, isBot, locationFrom, parseDevice } from './site-source';

/** A visit id or visitor id made in the browser. */
const id = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);
const text = (max: number) => z.string().max(2000).transform((s) => s.slice(0, max));

/** One beacon from the landing page (short keys keep it small). */
const eventSchema = z.object({
  /** view | click | leave */
  k: z.enum(['view', 'click', 'leave']),
  /** visit id */
  v: id,
  /** visitor id */
  u: id,
  /** page path + query (the first view's query carries the UTM tags) */
  p: text(500),
  /** document.referrer */
  r: text(500).optional(),
  /** button id (click) */
  b: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  /** where the button goes (click) */
  t: text(80).optional(),
  /** navigator.language */
  l: z.string().max(20).optional(),
  /** seconds on the site so far (leave) */
  s: z.number().int().min(0).max(86_400).optional(),
});
export type SiteEventInput = z.infer<typeof eventSchema>;

export interface RequestInfo {
  headers: Record<string, string | string[] | undefined>;
  userAgent: string | null;
}

const pathOnly = (p: string) => {
  try {
    return new URL(p, 'https://site.invalid').pathname.slice(0, 200) || '/';
  } catch {
    return '/';
  }
};

/**
 * Marketing-site traffic (landing/ → POST /v1/site/events): visits, page views
 * and "go to the app" clicks, with where they came from, country and device.
 * No IP address or personal data is stored. A web-app sign-up that started on
 * the site links its visit (attribute), so admin can count sign-ups per source.
 */
@Injectable()
export class SiteService {
  private readonly log = new Logger(SiteService.name);
  private readonly ownHosts: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    config: AppConfig,
  ) {
    const host = (u: string) => {
      try {
        return new URL(u).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    };
    this.ownHosts = [host(config.get('INVITE_LINK_BASE')), host(config.get('WEB_APP_URL'))].filter(Boolean);
  }

  /** Takes one event or a small batch; bad or bot events are dropped silently (it's a beacon). */
  async record(raw: unknown, req: RequestInfo): Promise<number> {
    if (isBot(req.userAgent)) return 0;
    let body = raw;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return 0;
      }
    }
    const list = (Array.isArray(body) ? body : [body]).slice(0, 10);
    let n = 0;
    for (const item of list) {
      const parsed = eventSchema.safeParse(item);
      if (!parsed.success) continue;
      try {
        await this.one(parsed.data, req);
        n++;
      } catch (e) {
        this.log.warn(`site event dropped: ${(e as Error).message}`);
      }
    }
    return n;
  }

  private async one(e: SiteEventInput, req: RequestInfo): Promise<void> {
    const now = this.clock.now();
    const path = pathOnly(e.p);
    if (e.k === 'view') {
      const existing = await this.prisma.siteVisit.findUnique({ where: { id: e.v }, select: { id: true } });
      if (existing) {
        await this.prisma.siteVisit.update({ where: { id: e.v }, data: { pages: { increment: 1 }, lastAt: now } });
      } else {
        const src = classifySource({ url: e.p, referrer: e.r, userAgent: req.userAgent, ownHosts: this.ownHosts });
        const dev = parseDevice(req.userAgent);
        const loc = locationFrom(req.headers);
        await this.prisma.siteVisit.upsert({
          where: { id: e.v },
          create: {
            id: e.v,
            visitorId: e.u,
            startedAt: now,
            lastAt: now,
            landingPath: path,
            ...src,
            ...loc,
            ...dev,
            lang: e.l ? e.l.slice(0, 2).toLowerCase() : null,
          },
          update: { pages: { increment: 1 }, lastAt: now },
        });
      }
      await this.prisma.siteEvent.create({ data: { visitId: e.v, kind: SiteEventKind.VIEW, path, at: now } });
      return;
    }
    const visit = await this.prisma.siteVisit.findUnique({ where: { id: e.v }, select: { id: true, seconds: true } });
    if (!visit) return;
    if (e.k === 'click') {
      await this.prisma.$transaction([
        this.prisma.siteVisit.update({ where: { id: e.v }, data: { clicks: { increment: 1 }, lastButton: e.b ?? null, lastAt: now } }),
        this.prisma.siteEvent.create({ data: { visitId: e.v, kind: SiteEventKind.CLICK, path, button: e.b ?? null, target: e.t ?? null, at: now } }),
      ]);
      return;
    }
    // leave: time on site so far (never goes down)
    if (e.s !== undefined && e.s > visit.seconds) await this.prisma.siteVisit.update({ where: { id: e.v }, data: { seconds: Math.min(e.s, 3600), lastAt: now } });
  }

  /**
   * A new account that came from the site: link the visit (once). Only for
   * accounts made in the last two days, and only a visit that started before
   * the account did.
   */
  async attribute(userId: string, visitId: string): Promise<{ linked: boolean }> {
    if (!id.safeParse(visitId).success) return { linked: false };
    const now = this.clock.now();
    const [user, visit, already] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.siteVisit.findUnique({ where: { id: visitId }, select: { userId: true, startedAt: true } }),
      this.prisma.siteVisit.findUnique({ where: { userId }, select: { id: true } }),
    ]);
    if (!user || !visit || visit.userId || already) return { linked: false };
    if (now.getTime() - user.createdAt.getTime() > 2 * MS.day) return { linked: false };
    if (visit.startedAt.getTime() > user.createdAt.getTime() + MS.minute) return { linked: false };
    const r = await this.prisma.siteVisit.updateMany({ where: { id: visitId, userId: null }, data: { userId, signedUpAt: user.createdAt } });
    return { linked: r.count === 1 };
  }

  /** Raw events are kept 90 days, visits (what the admin page counts) about 13 months. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    const now = this.clock.now().getTime();
    await this.prisma.siteEvent.deleteMany({ where: { at: { lt: new Date(now - 90 * MS.day) } } });
    await this.prisma.siteVisit.deleteMany({ where: { startedAt: { lt: new Date(now - 400 * MS.day) } } });
  }
}
