import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason, ReportStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { AdminListQuery, QueryList } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';
import { AdminReportsService } from './admin-reports.service';

class ReportListQuery extends AdminListQuery {
  @ApiPropertyOptional({ description: 'Comma-separated statuses (default OPEN)' })
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(ReportStatus), { each: true })
  status?: ReportStatus[];

  @ApiPropertyOptional({ description: 'Comma-separated reasons' })
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(ReportReason), { each: true })
  reason?: ReportReason[];

  @IsOptional()
  @IsString()
  reportedId?: string;

  @IsOptional()
  @IsString()
  reporterId?: string;
}

class ByPersonQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

class ResolveDto {
  @IsIn(['dismiss', 'warn', 'ban'])
  action!: 'dismiss' | 'warn' | 'ban';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(87_600)
  hours?: number;

  /** Warn: the message the person sees. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class BulkResolveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['dismiss', 'ban'])
  action!: 'dismiss' | 'ban';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(87_600)
  hours?: number;
}

@StaffApi('moderation')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  @RequirePermissions(P.ModerationView)
  list(@Query() q: ReportListQuery) {
    return this.reports.list({ ...q, status: q.status ?? [ReportStatus.OPEN] });
  }

  @Get('stats')
  @RequirePermissions(P.ModerationView)
  stats() {
    return this.reports.stats();
  }

  @Get('by-person')
  @RequirePermissions(P.ModerationView)
  @ApiOperation({ summary: 'People with open reports, most-reported first' })
  byPerson(@Query() q: ByPersonQuery) {
    return this.reports.byPerson(q.offset, q.limit);
  }

  @Get(':id')
  @RequirePermissions(P.ModerationView)
  get(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string) {
    return this.reports.get(me, id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(P.ModerationResolve)
  @Audit('report.resolved', { target: 'report', summary: ({ body }) => `${String(body.action)}${body.hours ? ` ${String(body.hours)}h` : ''}` })
  resolve(@Param('id') id: string, @Body() dto: ResolveDto) {
    return this.reports.resolve(id, dto.action, dto);
  }

  @Post('resolve')
  @HttpCode(200)
  @RequirePermissions(P.ModerationResolve)
  @Audit('report.bulk_resolved', { target: 'report', summary: ({ body }) => `${String(body.action)} ${(body.ids as string[]).length} reports` })
  resolveMany(@Body() dto: BulkResolveDto) {
    return this.reports.resolveMany(dto.ids, dto.action, dto);
  }
}
