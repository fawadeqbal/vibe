import { Injectable, Logger } from '@nestjs/common';

import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type SearchOutcome = 'matched' | 'gave_up' | 'friend_call' | 'banned' | 'failed' | 'restarted';

/**
 * Writes down every search for a match — when it started, how it ended and
 * how long it took — for admin → Matching (waits, people giving up, busy
 * hours). Never throws: matching must not fail because a log line did.
 */
@Injectable()
export class MatchSearchLog {
  private readonly logger = new Logger(MatchSearchLog.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async start(userId: string): Promise<void> {
    await this.close(userId, 'restarted');
    await this.prisma.matchSearch.create({ data: { userId, startedAt: this.clock.now() } }).catch((e: Error) => this.logger.warn(`search start: ${e.message}`));
  }

  /** Ends the person's open search, if they have one. */
  async close(userId: string, outcome: SearchOutcome): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$executeRaw`
      UPDATE "MatchSearch"
         SET "endedAt" = ${now}, "outcome" = ${outcome},
             "waitMs" = GREATEST(0, (EXTRACT(EPOCH FROM (${now}::timestamp - "startedAt")) * 1000)::int)
       WHERE "userId" = ${userId} AND "endedAt" IS NULL`.catch((e: Error) => this.logger.warn(`search close: ${e.message}`));
  }

  async markRematchSoon(userId: string): Promise<void> {
    await this.prisma.matchSearch.updateMany({ where: { userId, endedAt: null }, data: { rematchSoon: true } }).catch(() => undefined);
  }
}
