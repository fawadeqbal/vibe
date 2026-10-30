import { HttpStatus, Injectable } from '@nestjs/common';
import { AppealStatus, Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { ModerationService } from './moderation.service';

export interface AppealView {
  id: string;
  status: AppealStatus;
  message: string;
  bannedUntil: string;
  createdAt: string;
  resolvedAt: string | null;
  staffNote: string | null;
}

const view = (a: { id: string; status: AppealStatus; message: string; bannedUntil: Date; createdAt: Date; resolvedAt: Date | null; staffNote: string | null }): AppealView => ({
  id: a.id,
  status: a.status,
  message: a.message,
  bannedUntil: a.bannedUntil.toISOString(),
  createdAt: a.createdAt.toISOString(),
  resolvedAt: a.resolvedAt?.toISOString() ?? null,
  staffNote: a.staffNote,
});

/**
 * "Think this is a mistake? Tell us": one appeal per pause. A moderator
 * accepts (the pause is lifted at once) or rejects it, and the person is told.
 */
@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  private async currentBan(userId: string): Promise<Date | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
    return u?.bannedUntil && u.bannedUntil > this.clock.now() ? u.bannedUntil : null;
  }

  /** The appeal for the current pause, if any. */
  async mine(userId: string): Promise<AppealView | null> {
    const until = await this.currentBan(userId);
    if (!until) return null;
    const a = await this.prisma.banAppeal.findUnique({ where: { userId_bannedUntil: { userId, bannedUntil: until } } });
    return a ? view(a) : null;
  }

  async create(userId: string, message: string): Promise<AppealView> {
    const until = await this.currentBan(userId);
    if (!until) throw new AppError(ErrorCode.VALIDATION_FAILED, "Your account isn't paused", HttpStatus.BAD_REQUEST);
    const text = message.trim();
    if (text.length < 10) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Tell us a little more (at least 10 letters)', HttpStatus.BAD_REQUEST);
    try {
      return view(await this.prisma.banAppeal.create({ data: { userId, bannedUntil: until, message: text.slice(0, 1000) } }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(ErrorCode.CONFLICT, 'You already told us about this pause — we’ll get back to you', HttpStatus.CONFLICT);
      throw e;
    }
  }

  // ── staff ────────────────────────────────────────────────────────────

  async list(status: AppealStatus[], cursor: string | undefined, limit: number) {
    const rows = await this.prisma.banAppeal.findMany({
      where: { status: { in: status } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { user: { select: { id: true, name: true, avatarUrl: true, bannedUntil: true, _count: { select: { reportsGot: true } } } } },
    });
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    const now = this.clock.now();
    return {
      items: page.map((a) => ({
        ...view(a),
        user: {
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl,
          bannedUntil: a.user.bannedUntil && a.user.bannedUntil > now ? a.user.bannedUntil.toISOString() : null,
          reports: a.user._count.reportsGot,
        },
      })),
      nextCursor: more ? page[page.length - 1].id : null,
    };
  }

  async openCount(): Promise<number> {
    return this.prisma.banAppeal.count({ where: { status: AppealStatus.OPEN } });
  }

  /** Accept lifts the pause; reject keeps it. Either way the person hears back. */
  async resolve(id: string, action: 'accept' | 'reject', note?: string): Promise<AppealView> {
    const a = await this.prisma.banAppeal.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('Appeal');
    if (a.status !== AppealStatus.OPEN) throw new AppError(ErrorCode.CONFLICT, 'This appeal was already answered', HttpStatus.CONFLICT);
    const status = action === 'accept' ? AppealStatus.ACCEPTED : AppealStatus.REJECTED;
    const done = await this.prisma.banAppeal.update({ where: { id }, data: { status, staffNote: note?.trim() || null, resolvedAt: this.clock.now() } });
    if (action === 'accept') await this.moderation.unban(a.userId);
    this.realtime.toUser(a.userId, ServerEvent.AccountAppeal, { status, note: done.staffNote });
    return view(done);
  }
}
