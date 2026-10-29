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

class DaysQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days: number = 7;
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

  @Get('funnel')
  @ApiOperation({ summary: 'New-user funnel: signed up → set up → first call → came back next day → paid (cached 5 min)' })
  funnel(@Query() q: SeriesQuery) {
    return this.dashboard.funnel(q.days);
  }

  @Get('discover')
  @ApiOperation({ summary: 'Discover (swipes, matches) and video calls in chat (asks, allowed, calls, missed) for the last N days' })
  discover(@Query() q: DaysQuery) {
    return this.dashboard.discover(q.days);
  }

  @Get('marketing')
  @ApiOperation({ summary: 'Marketing site: visitors, clicks to the app, sign-ups; by source, country/region, page, button, campaign and device; live (cached 60 s)' })
  marketing(@Query() q: DaysQuery) {
    return this.dashboard.marketing(q.days ?? 7);
  }

  @Get('series')
  @ApiOperation({ summary: 'Daily series for charts (business days, cached 5 min)' })
  series(@Query() q: SeriesQuery) {
    return this.dashboard.series(q.days);
  }
}
