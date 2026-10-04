import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { P } from '../core/permissions';
import { RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import { DashboardService } from './dashboard.service';

class SeriesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(180)
  days: number = 30;
}

@StaffApi('dashboard')
@RequirePermissions(P.DashboardView)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'KPIs and work queues (cached 60 s; live numbers are real-time)' })
  summary() {
    return this.dashboard.summary();
  }

  @Get('series')
  @ApiOperation({ summary: 'Daily series for charts (business days, cached 5 min)' })
  series(@Query() q: SeriesQuery) {
    return this.dashboard.series(q.days);
  }
}
