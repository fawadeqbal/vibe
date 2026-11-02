import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { P } from '../core/permissions';
import { RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import { ClientFilter, InsightsService } from './insights.service';

class InsightsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days: number = 7;

  /** all | app (joined in the Android/iPhone app) | web */
  @IsOptional()
  @IsIn(['all', 'app', 'web'])
  client: ClientFilter = 'all';
}

@StaffApi('dashboard')
@Controller('admin/insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('health')
  @RequirePermissions(P.DashboardView)
  @ApiOperation({ summary: 'Dashboard: 5 health numbers vs the window before, daily series, plain-language notes, things that need someone' })
  health(@Query() q: InsightsQuery) {
    return this.insights.health(q.days, q.client);
  }

  @Get('matching')
  @RequirePermissions(P.DashboardView)
  @ApiOperation({ summary: 'Matching: waits, people giving up, busy hours (day × hour), quick skips, reports per 100 calls' })
  matching(@Query() q: InsightsQuery) {
    return this.insights.matching(q.days);
  }

  @Get('growth')
  @RequirePermissions(P.DashboardView)
  @ApiOperation({ summary: 'Growth: per source visitors → downloads → sign-ups → good first call → came back → paid; weekly retention' })
  growth(@Query() q: InsightsQuery) {
    return this.insights.growth(q.days, q.client);
  }

  @Get('money')
  @RequirePermissions(P.FinanceView)
  @ApiOperation({ summary: 'Money: who pays, how much, what sells, days to the first purchase' })
  money(@Query() q: InsightsQuery) {
    return this.insights.money(q.days, q.client);
  }
}
