import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { P } from '../core/permissions';
import { RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import { PlatformsService } from '../../platforms/platforms.service';
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

  /** all | app | web (people who joined there). */
  @IsOptional()
  @IsIn(['all', 'app', 'web'])
  client: 'all' | 'app' | 'web' = 'all';
}

class VisitsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days: number = 7;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsIn([10, 20, 50, 100])
  pageSize: number = 20;

  /** signed_up | clicked | reading | left */
  @IsOptional()
  @IsIn(['signed_up', 'clicked', 'reading', 'left'])
  did?: 'signed_up' | 'clicked' | 'reading' | 'left';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;

  /** City, region, country code or page. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

@StaffApi('dashboard')
@RequirePermissions(P.DashboardView)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly platforms: PlatformsService,
  ) {}

  @Get('platforms')
  @ApiOperation({ summary: 'App vs web: sign-ups by where they were made, daily active people by client, Android downloads (cached 60 s)' })
  platformsReport(@Query() q: DaysQuery) {
    return this.platforms.report(q.days ?? 7);
  }

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
    return this.dashboard.discover(q.days, q.client);
  }

  @Get('marketing')
  @ApiOperation({ summary: 'Marketing site: visitors, clicks to the app, sign-ups; by source, country/region, page, button, campaign and device; live (cached 60 s)' })
  marketing(@Query() q: DaysQuery) {
    return this.dashboard.marketing(q.days ?? 7);
  }

  @Get('marketing/visits')
  @ApiOperation({ summary: 'Marketing site: every visit in the window, newest first, a page at a time (filter by outcome, channel, place or page)' })
  marketingVisits(@Query() q: VisitsQuery) {
    return this.dashboard.marketingVisits(q);
  }

  @Get('series')
  @ApiOperation({ summary: 'Daily series for charts (business days, cached 5 min)' })
  series(@Query() q: SeriesQuery) {
    return this.dashboard.series(q.days);
  }
}
