import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AppealsService } from './appeals.service';

/** Notes the Vibe team sent you that are about your account (kept 90 days, like the Notifications page). */
const NOTE_TYPES = ['account.warning', 'account.paused', 'account.appeal'];
const KEEP_DAYS = 90;

/**
 * Me → Account status: whether matching is paused and until when, your
 * appeal, and the notes from the Vibe team (warnings, a removed Moment or
 * photo, pauses, appeal answers). Account notifications open this page.
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/status')
export class AccountStatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appeals: AppealsService,
    private readonly clock: Clock,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Pause, appeal and notes from the Vibe team' })
  async status(@CurrentUser('id') me: string) {
    const now = this.clock.now();
    const [user, appeal, notes] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: me }, select: { bannedUntil: true } }),
      this.appeals.mine(me),
      this.prisma.activityItem.findMany({
        where: {
          userId: me,
          type: { in: NOTE_TYPES },
          createdAt: { gte: new Date(now.getTime() - KEEP_DAYS * MS.day) },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const paused = user?.bannedUntil && user.bannedUntil > now ? user.bannedUntil.toISOString() : null;
    return {
      pausedUntil: paused,
      appeal,
      notes: notes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }
}
