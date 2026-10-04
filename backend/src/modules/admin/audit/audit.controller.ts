import { Controller, Get, Query } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AdminListQuery, createdRange, pageArgs, toAdminPage } from '../core/admin-query';
import { P } from '../core/permissions';
import { RequirePermissions, StaffApi } from '../core/staff-api.decorator';

class AuditQuery extends AdminListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Exact action, or a prefix ending in "." (e.g. "user.")' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetId?: string;
}

@StaffApi('audit')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(P.AuditView)
  async list(@Query() q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      actorId: q.actorId,
      action: q.action ? (q.action.endsWith('.') ? { startsWith: q.action } : q.action) : undefined,
      targetType: q.targetType,
      targetId: q.targetId,
      createdAt: createdRange(q),
      ...(q.q ? { OR: [{ actorEmail: { contains: q.q, mode: 'insensitive' } }, { summary: { contains: q.q, mode: 'insensitive' } }, { targetId: q.q }] } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({ where, ...pageArgs(q) });
    return toAdminPage(rows, q.limit, (r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  @Get('actions')
  @RequirePermissions(P.AuditView)
  async actions() {
    // Recent window only: the log grows forever, the filter list shouldn't scan all of it.
    const since = new Date(Date.now() - 90 * 86_400_000);
    const rows = await this.prisma.auditLog.groupBy({ by: ['action'], where: { createdAt: { gte: since } }, _count: true, orderBy: { action: 'asc' } });
    return rows.map((r) => ({ action: r.action, count: r._count }));
  }
}
