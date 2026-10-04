import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ReportReason } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { EconomyService } from '../catalog/economy.service';
import { BlocksService } from '../social/blocks.service';

export const USER_BANNED = 'moderation.user-banned';
export interface UserBannedEvent {
  userId: string;
  until: Date;
}

/**
 * Reports, the strike rule (3 people reporting someone within 24h → 24h
 * ban), and manual bans. A ban disconnects the user everywhere at once.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
  ) {}

  async report(reporterId: string, input: { userId: string; reason: ReportReason; matchId?: string; note?: string; block?: boolean }) {
    if (reporterId === input.userId) throw AppError.forbidden("You can't report yourself");
    await this.prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true } }).catch(() => {
      throw AppError.notFound('User');
    });
    let report;
    try {
      report = await this.prisma.report.create({
        data: { reporterId, reportedId: input.userId, reason: input.reason, matchId: input.matchId, note: input.note?.trim() || null },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      report = await this.prisma.report.findFirstOrThrow({ where: { reporterId, reportedId: input.userId, matchId: input.matchId } });
    }
    if (input.block !== false) await this.blocks.block(reporterId, input.userId);
    await this.applyStrikes(input.userId, input.reason);
    return { id: report.id, blocked: input.block !== false };
  }

  private async applyStrikes(userId: string, reason: ReportReason): Promise<void> {
    const since = new Date(this.clock.now().getTime() - this.economy.rules.autoBanWindowHours * MS.hour);
    const reporters = await this.prisma.report.groupBy({ by: ['reporterId'], where: { reportedId: userId, createdAt: { gte: since } } });
    // Underage reports are urgent: one is enough to pull the account for review.
    const threshold = reason === ReportReason.UNDERAGE ? 1 : this.economy.rules.autoBanReports;
    if (reporters.length >= threshold) await this.ban(userId, this.economy.rules.autoBanHours, `auto: ${reporters.length} reports`);
  }

  async ban(userId: string, hours: number, why: string): Promise<Date> {
    const until = new Date(this.clock.now().getTime() + hours * MS.hour);
    await this.prisma.user.update({ where: { id: userId }, data: { bannedUntil: until } });
    this.logger.warn(`Banned ${userId} until ${until.toISOString()} (${why})`);
    this.realtime.toUser(userId, ServerEvent.AccountBanned, { until: until.toISOString() });
    this.events.emit(USER_BANNED, { userId, until } satisfies UserBannedEvent);
    setTimeout(() => this.realtime.disconnectUser(userId), 500); // let the event arrive first
    return until;
  }

  async unban(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { bannedUntil: null } });
  }

  async assertNotBanned(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
    if (u?.bannedUntil && u.bannedUntil > this.clock.now()) {
      throw new AppError(ErrorCode.ACCOUNT_BANNED, 'Your account is paused after reports. Try again later.', HttpStatus.FORBIDDEN, { until: u.bannedUntil.toISOString() });
    }
  }
}
