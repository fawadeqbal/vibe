import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StreakService } from '../social/streak.service';
import { EngagementService } from './engagement.service';
import { Board, BOARDS, ProgressService } from './progress.service';
import { RecapService } from './recap.service';

class LeaderboardQuery {
  @IsOptional()
  @IsIn(BOARDS)
  board: Board = 'xp';
}

class ReminderDto {
  @IsBoolean()
  on!: boolean;
}

@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(
    private readonly engagement: EngagementService,
    private readonly progress: ProgressService,
    private readonly streaks: StreakService,
    private readonly recaps: RecapService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('engagement')
  @ApiOperation({ summary: 'One call on app start/resume: Vibe Hour window, your level, and how many friend streaks end tonight' })
  async summary(@CurrentUser('id') me: string) {
    const [progress, streaksAtRisk, u] = await Promise.all([
      this.progress.level(me),
      this.streaks.atRiskCount(me),
      this.prisma.user.findUnique({ where: { id: me }, select: { vibeHourReminder: true } }),
    ]);
    return { vibeHour: this.engagement.vibeHour(), progress, streaksAtRisk, vibeHourReminder: u?.vibeHourReminder ?? false };
  }

  @Put('engagement/vibe-hour/reminder')
  @ApiOperation({ summary: '"Remind me" before Vibe Hour: a push 15 min before (or an e-mail without the app). Stops by itself after a week away.' })
  async setReminder(@CurrentUser('id') me: string, @Body() body: ReminderDto) {
    await this.prisma.user.update({ where: { id: me }, data: { vibeHourReminder: body.on } });
    return { vibeHourReminder: body.on };
  }

  @Get('me/progress')
  @ApiOperation({ summary: 'Level, XP, this week XP and every badge with progress' })
  myProgress(@CurrentUser('id') me: string) {
    return this.progress.progress(me);
  }

  @Get('me/recap')
  @ApiOperation({ summary: "Last week's numbers (Monday–Sunday, business time)" })
  recap(@CurrentUser('id') me: string) {
    return this.recaps.forUser(me);
  }

  @Get('leaderboards')
  @ApiOperation({ summary: "This week's top 50 by XP (board=xp) or gems received (board=gems), plus your own rank" })
  leaderboard(@CurrentUser('id') me: string, @Query() q: LeaderboardQuery) {
    return this.progress.leaderboard(q.board, me);
  }
}
