import { Injectable } from '@nestjs/common';
import { Prisma, ReportReason, ReportStatus } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { Clock, MS } from '../../../common/utils/clock';
import { orderedPair } from '../../../common/utils/text';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ServerEvent } from '../../../infra/realtime/realtime.events';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { ModerationService } from '../../moderation/moderation.service';
import { can, createdRange, pageArgs, toAdminPage } from '../core/admin-query';
import { P } from '../core/permissions';
import type { StaffPrincipal } from '../core/staff.types';

export type ResolveAction = 'dismiss' | 'warn' | 'ban';

export interface ReportListFilters {
  status?: ReportStatus[];
  reason?: ReportReason[];
  reportedId?: string;
  reporterId?: string;
  q?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

const PERSON = { select: { id: true, name: true, avatarUrl: true, verified: true, bannedUntil: true, createdAt: true } } as const;

/** The report queue: triage per report or per person, resolve one or many. */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  async list(f: ReportListFilters) {
    const where: Prisma.ReportWhereInput = {
      status: f.status?.length ? { in: f.status } : undefined,
      reason: f.reason?.length ? { in: f.reason } : undefined,
      reportedId: f.reportedId,
      reporterId: f.reporterId,
      createdAt: createdRange(f),
      ...(f.q ? { reported: { name: { contains: f.q, mode: 'insensitive' } } } : {}),
    };
    const rows = await this.prisma.report.findMany({ where, include: { reporter: PERSON, reported: PERSON }, ...pageArgs(f) });
    const openCounts = await this.openCounts(rows.map((r) => r.reportedId));
    return toAdminPage(rows, f.limit, (r) => ({ ...this.view(r), reportedOpenReports: openCounts.get(r.reportedId) ?? 0 }));
  }

  /** People with open reports, most-reported first — the moderator's work list. */
  async byPerson(skip: number, take: number) {
    const groups = await this.prisma.report.groupBy({
      by: ['reportedId'],
      where: { status: ReportStatus.OPEN },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: [{ _count: { reportedId: 'desc' } }, { _max: { createdAt: 'desc' } }],
      skip,
      take: take + 1,
    });
    const page = groups.slice(0, take);
    const ids = page.map((g) => g.reportedId);
    const [people, reasons] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, ...PERSON }),
      this.prisma.report.groupBy({ by: ['reportedId', 'reason'], where: { reportedId: { in: ids }, status: ReportStatus.OPEN }, _count: { _all: true } }),
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      items: page.map((g) => ({
        user: byId.get(g.reportedId) ?? null,
        openReports: g._count._all,
        lastReportAt: g._max.createdAt?.toISOString() ?? null,
        reasons: Object.fromEntries(reasons.filter((r) => r.reportedId === g.reportedId).map((r) => [r.reason, r._count._all])),
      })),
      nextOffset: groups.length > take ? skip + take : null,
    };
  }

  async get(staff: StaffPrincipal, id: string) {
    const r = await this.prisma.report.findUnique({ where: { id }, include: { reporter: PERSON, reported: PERSON } });
    if (!r) throw AppError.notFound('Report');
    const [match, others, priorActioned] = await Promise.all([
      r.matchId ? this.prisma.match.findUnique({ where: { id: r.matchId } }) : null,
      this.prisma.report.findMany({ where: { reportedId: r.reportedId, id: { not: r.id } }, include: { reporter: PERSON }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.report.count({ where: { reportedId: r.reportedId, status: ReportStatus.ACTIONED } }),
    ]);
    let messages: { id: string; senderId: string; text: string; giftId: string | null; createdAt: string }[] | null = null;
    if (can(staff, P.ModerationMessages)) {
      const [low, high] = orderedPair(r.reporterId, r.reportedId);
      const f = await this.prisma.friendship.findUnique({ where: { userLowId_userHighId: { userLowId: low, userHighId: high } } });
      if (f) {
        const rows = await this.prisma.message.findMany({ where: { friendshipId: f.id }, orderBy: { createdAt: 'desc' }, take: 50 });
        messages = rows.reverse().map((m) => ({ id: m.id, senderId: m.senderId, text: m.text, giftId: m.giftId, createdAt: m.createdAt.toISOString() }));
      }
    }
    return {
      ...this.view(r),
      match: match && {
        id: match.id,
        startedAt: match.startedAt.toISOString(),
        endedAt: match.endedAt?.toISOString() ?? null,
        seconds: match.endedAt ? Math.round((match.endedAt.getTime() - match.startedAt.getTime()) / 1000) : null,
        endReason: match.endReason,
      },
      otherReports: others.map((o) => ({ id: o.id, reason: o.reason, status: o.status, note: o.note, reporter: o.reporter, createdAt: o.createdAt.toISOString() })),
      priorActioned,
      messages,
      canReadMessages: can(staff, P.ModerationMessages),
    };
  }

  /**
   * Resolves a report. Warn and ban close every open report against that
   * person (they were dealt with); dismiss closes only this one.
   */
  async resolve(id: string, action: ResolveAction, opts: { hours?: number; note?: string }) {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('Report');
    if (r.status !== ReportStatus.OPEN) throw AppError.conflict('This report was already resolved');
    return this.apply([r], action, opts);
  }

  async resolveMany(ids: string[], action: Exclude<ResolveAction, 'warn'>, opts: { hours?: number }) {
    const reports = await this.prisma.report.findMany({ where: { id: { in: ids }, status: ReportStatus.OPEN } });
    return this.apply(reports, action, opts);
  }

  async stats() {
    const now = this.clock.now();
    const d7 = new Date(now.getTime() - 7 * MS.day);
    const [open, byReason, today, actioned7, dismissed7, review] = await Promise.all([
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.groupBy({ by: ['reason'], where: { status: ReportStatus.OPEN }, _count: { _all: true } }),
      this.prisma.report.count({ where: { createdAt: { gte: this.clock.startOfDay(now) } } }),
      this.prisma.report.count({ where: { status: ReportStatus.ACTIONED, reviewedAt: { gte: d7 } } }),
      this.prisma.report.count({ where: { status: ReportStatus.DISMISSED, reviewedAt: { gte: d7 } } }),
      this.prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")))::float AS avg FROM "Report" WHERE "reviewedAt" >= ${d7}`,
    ]);
    return {
      open,
      openByReason: Object.fromEntries(byReason.map((b) => [b.reason, b._count._all])),
      today,
      actioned7d: actioned7,
      dismissed7d: dismissed7,
      avgReviewMinutes: review[0]?.avg ? Math.round(review[0].avg / 60) : null,
    };
  }

  private async apply(reports: { id: string; reportedId: string }[], action: ResolveAction, opts: { hours?: number; note?: string }) {
    const now = this.clock.now();
    const people = [...new Set(reports.map((r) => r.reportedId))];
    if (action === 'dismiss') {
      const n = await this.prisma.report.updateMany({ where: { id: { in: reports.map((r) => r.id) }, status: ReportStatus.OPEN }, data: { status: ReportStatus.DISMISSED, reviewedAt: now } });
      return { resolved: n.count, people: people.length };
    }
    const n = await this.prisma.report.updateMany({ where: { reportedId: { in: people }, status: ReportStatus.OPEN }, data: { status: ReportStatus.ACTIONED, reviewedAt: now } });
    for (const userId of people) {
      if (action === 'ban') await this.moderation.ban(userId, opts.hours ?? 24 * 7, 'staff: report review');
      else {
        this.realtime.toUser(userId, ServerEvent.AccountWarning, {
          message: opts.note?.trim() || 'People reported your behaviour. Please follow the community guidelines, or your account may be paused.',
        });
      }
    }
    return { resolved: n.count, people: people.length };
  }

  private async openCounts(userIds: string[]): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();
    const rows = await this.prisma.report.groupBy({ by: ['reportedId'], where: { reportedId: { in: [...new Set(userIds)] }, status: ReportStatus.OPEN }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.reportedId, r._count._all]));
  }

  private view(r: Prisma.ReportGetPayload<{ include: { reporter: typeof PERSON; reported: typeof PERSON } }>) {
    return {
      id: r.id,
      reason: r.reason,
      status: r.status,
      note: r.note,
      matchId: r.matchId,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reporter: { ...r.reporter, createdAt: r.reporter.createdAt.toISOString(), bannedUntil: r.reporter.bannedUntil?.toISOString() ?? null },
      reported: { ...r.reported, createdAt: r.reported.createdAt.toISOString(), bannedUntil: r.reported.bannedUntil && r.reported.bannedUntil > this.clock.now() ? r.reported.bannedUntil.toISOString() : null },
    };
  }
}
