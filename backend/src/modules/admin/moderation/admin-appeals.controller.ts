import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { AppealStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { AppealsService } from '../../moderation/appeals.service';
import { QueryList } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, RequirePermissions, StaffApi } from '../core/staff-api.decorator';

class AppealListQuery {
  @ApiPropertyOptional({ description: 'Comma-separated statuses (default OPEN)' })
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(AppealStatus), { each: true })
  status?: AppealStatus[];

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

class ResolveAppealDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';

  /** Shown to the person. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@StaffApi('moderation')
@Controller('admin/appeals')
export class AdminAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  @RequirePermissions(P.ModerationView)
  @ApiOperation({ summary: '"This is a mistake" appeals from paused people, newest first' })
  list(@Query() q: AppealListQuery) {
    return this.appeals.list(q.status ?? [AppealStatus.OPEN], q.cursor, q.limit);
  }

  @Get('stats')
  @RequirePermissions(P.ModerationView)
  async stats() {
    return { open: await this.appeals.openCount() };
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(P.ModerationResolve)
  @ApiOperation({ summary: 'Accept (lifts the pause now) or reject; the person is told either way' })
  @Audit('appeal.resolved', { target: 'appeal', summary: ({ body }) => String(body.action) })
  resolve(@Param('id') id: string, @Body() dto: ResolveAppealDto) {
    return this.appeals.resolve(id, dto.action, dto.note);
  }
}
