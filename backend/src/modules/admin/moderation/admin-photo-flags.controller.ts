import { Controller, Get, HttpCode, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';

import { CursorQueryDto } from '../../../common/dto/pagination.dto';
import { AppError } from '../../../common/errors/app-error';
import { Clock } from '../../../common/utils/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { StorageProvider } from '../../../infra/storage/storage.provider';
import { PhotoSweeperService } from '../../safety/photo-sweeper.service';
import { pageArgs, toAdminPage } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, RequirePermissions, StaffApi } from '../core/staff-api.decorator';

class PhotoFlagQuery extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Only this person' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: ['blocked', 'review'] })
  @IsOptional()
  @IsIn(['blocked', 'review'])
  action?: 'blocked' | 'review';

  @ApiPropertyOptional({ description: 'open = not looked at yet' })
  @IsOptional()
  @IsIn(['open', 'all'])
  status: 'open' | 'all' = 'all';
}

const PERSON = { select: { id: true, name: true, avatarUrl: true, verified: true, bannedUntil: true } } as const;

/**
 * Photos the nudity filter acted on (MediaFlag, last 30 days): blocked ones
 * (never sent; a private copy is kept as evidence) and borderline ones that
 * were sent but should be looked at. Every image view is audited.
 */
@StaffApi('moderation')
@Controller('admin/photo-flags')
export class AdminPhotoFlagsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly clock: Clock,
    private readonly sweeper: PhotoSweeperService,
  ) {}

  @Get()
  @RequirePermissions(P.ModerationView)
  @ApiOperation({ summary: 'Photos blocked or flagged by the nudity filter, newest first' })
  async list(@Query() q: PhotoFlagQuery) {
    const where = { ...(q.userId ? { userId: q.userId } : {}), ...(q.action ? { action: q.action } : {}), ...(q.status === 'open' ? { reviewedAt: null } : {}) };
    const [rows, open, backlog] = await Promise.all([this.prisma.mediaFlag.findMany({ where, ...pageArgs(q) }), this.prisma.mediaFlag.count({ where: { ...where, reviewedAt: null } }), this.sweeper.backlog()]);
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, ...PERSON });
    const byId = new Map(users.map((u) => [u.id, { ...u, bannedUntil: u.bannedUntil && u.bannedUntil > this.clock.now() ? u.bannedUntil.toISOString() : null }]));
    return {
      open,
      /** Older photos (from before the filter, or set some other way) still waiting for their first check. */
      backlog,
      ...toAdminPage(rows, q.limit, (r) => ({
        id: r.id,
        user: byId.get(r.userId) ?? { id: r.userId, name: 'Deleted user', avatarUrl: '', verified: false, bannedUntil: null },
        place: r.place,
        score: r.score,
        action: r.action,
        hasImage: !!r.key,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  @Get(':id/image')
  @RequirePermissions(P.ModerationView)
  @Audit('photo_flag.viewed', { target: 'photo_flag', param: 'id' })
  @ApiOperation({ summary: 'The flagged photo (blocked ones from private storage)' })
  async image(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.prisma.mediaFlag.findUnique({ where: { id } });
    if (!f?.key) throw AppError.notFound('Photo');
    const bytes = await this.storage.read(f.key, f.action === 'blocked' ? { private: true } : undefined);
    if (!bytes) throw AppError.notFound('Photo');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/jpeg');
    return new StreamableFile(bytes);
  }

  @Post(':id/reviewed')
  @HttpCode(200)
  @RequirePermissions(P.ModerationResolve)
  @Audit('photo_flag.reviewed', { target: 'photo_flag', param: 'id' })
  async reviewed(@Param('id') id: string) {
    const r = await this.prisma.mediaFlag.updateMany({ where: { id, reviewedAt: null }, data: { reviewedAt: this.clock.now() } });
    if (!r.count && !(await this.prisma.mediaFlag.count({ where: { id } }))) throw AppError.notFound('Photo flag');
    return { ok: true };
  }
}
