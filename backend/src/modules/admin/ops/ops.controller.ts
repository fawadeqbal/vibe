import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AnnouncementAudience, AnnouncementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDefined, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

import { OK } from '../../../common/dto/ok.dto';
import { AppError } from '../../../common/errors/app-error';
import { Clock, MS } from '../../../common/utils/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AnnouncementsService } from '../../announcements/announcements.service';
import { MatchingService } from '../../matching/matching.service';
import { SettingsService } from '../../settings/settings.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class LiveQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}

class AnnouncementDto {
  @IsString()
  @Length(2, 80)
  title!: string;

  @IsString()
  @Length(2, 500)
  body!: string;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  body?: string;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  expiresAt?: string | null;
}

class AnnouncementQuery {
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;
}

class SettingDto {
  /** Type depends on the setting (boolean, number or string). */
  @IsDefined()
  value!: unknown;
}

@StaffApi('operations')
@Controller('admin')
export class OpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly realtime: RealtimeService,
    private readonly announcements: AnnouncementsService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  // ── live ──────────────────────────────────────────────────────────────────

  @Get('live')
  @RequirePermissions(P.OpsLive)
  @ApiOperation({ summary: 'Right now: online, searching, and the live calls (poll every few seconds)' })
  async live(@Query() q: LiveQuery) {
    const since = new Date(this.clock.now().getTime() - 6 * MS.hour);
    const [counts, calls, callCount] = await Promise.all([
      this.matching.onlineCount(),
      this.prisma.match.findMany({ where: { endedAt: null, startedAt: { gt: since } }, orderBy: { startedAt: 'desc' }, take: q.limit }),
      this.prisma.match.count({ where: { endedAt: null, startedAt: { gt: since } } }),
    ]);
    const ids = [...new Set(calls.flatMap((c) => [c.userAId, c.userBId]))];
    const people = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, avatarUrl: true, countryCode: true, isBot: true, verified: true } })).map((u) => [u.id, u]));
    return {
      at: this.clock.now().toISOString(),
      online: counts.online,
      searching: counts.searching,
      inCalls: callCount,
      calls: calls.map((c) => ({ id: c.id, startedAt: c.startedAt.toISOString(), a: people.get(c.userAId) ?? null, b: people.get(c.userBId) ?? null, coinsSpent: c.coinsSpentA + c.coinsSpentB })),
    };
  }

  @Post('live/calls/:id/end')
  @HttpCode(200)
  @RequirePermissions(P.OpsLive, P.ModerationResolve)
  @Audit('call.ended', { target: 'match' })
  async endCall(@Param('id') id: string) {
    if (!(await this.matching.endByStaff(id))) {
      // Not in Redis any more: close the stale row so it leaves the list.
      const stale = await this.prisma.match.updateMany({ where: { id, endedAt: null }, data: { endedAt: this.clock.now(), endReason: 'STOPPED' } });
      if (stale.count === 0) throw AppError.notFound('Live call');
    }
    return OK;
  }

  // ── announcements ─────────────────────────────────────────────────────────

  @Get('announcements')
  @RequirePermissions(P.OpsAnnouncements)
  list(@Query() q: AnnouncementQuery) {
    return this.announcements.list(q.status);
  }

  @Post('announcements')
  @RequirePermissions(P.OpsAnnouncements)
  @Audit('announcement.created', { target: 'announcement', summary: ({ body }) => String(body.title) })
  create(@CurrentStaff() me: StaffPrincipal, @Body() dto: AnnouncementDto) {
    return this.announcements.create(me.id, dto);
  }

  @Patch('announcements/:id')
  @RequirePermissions(P.OpsAnnouncements)
  @Audit('announcement.updated', { target: 'announcement' })
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcements.update(id, dto);
  }

  @Post('announcements/:id/publish')
  @HttpCode(200)
  @RequirePermissions(P.OpsAnnouncements)
  @Audit('announcement.published', { target: 'announcement' })
  publish(@Param('id') id: string) {
    return this.announcements.publish(id);
  }

  @Post('announcements/:id/archive')
  @HttpCode(200)
  @RequirePermissions(P.OpsAnnouncements)
  @Audit('announcement.archived', { target: 'announcement' })
  archive(@Param('id') id: string) {
    return this.announcements.archive(id);
  }

  // ── settings ────────────────────────────────────────────────────

  @Get('settings')
  @RequirePermissions(P.OpsSettings)
  allSettings() {
    return this.settings.describe();
  }

  @Put('settings/:key')
  @RequirePermissions(P.OpsSettings)
  @Audit('setting.changed', { target: 'setting', param: 'key', summary: ({ params, body }) => `${params.key} → ${JSON.stringify(body.value)}` })
  async setSetting(@CurrentStaff() me: StaffPrincipal, @Param('key') key: string, @Body() dto: SettingDto) {
    if (key === 'security.require2fa' && dto.value === true && !me.twoFactorEnabled) {
      throw AppError.conflict('Turn on two-factor for your own account first, so you are not locked out.');
    }
    const r = await this.settings.set(key, dto.value, me.id);
    return { key: r.key, value: r.value, previous: r.previous };
  }

  @Get('online/:userId')
  @RequirePermissions(P.OpsLive)
  async online(@Param('userId') userId: string) {
    return { online: await this.realtime.isOnline(userId), call: await this.matching.isInCall(userId) };
  }
}
