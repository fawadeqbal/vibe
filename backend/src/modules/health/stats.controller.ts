import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { SkipMaintenance } from '../settings/maintenance.guard';

const CACHE_MS = 10_000;

/**
 * Public numbers for the landing page (landing/): no sign-in, no personal data.
 * Readable from any origin (a plain GET without credentials), cached briefly so
 * a busy landing page costs one Redis call per instance every 10 s.
 */
@ApiTags('stats')
@Public()
@SkipMaintenance()
@Controller('stats')
export class StatsController {
  private cached: { online: number; at: number } | null = null;

  constructor(private readonly realtime: RealtimeService) {}

  /** People connected right now (same count as the admin dashboard). */
  @Get('online')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=15')
  @ApiOkResponse({ schema: { example: { online: 2743 } } })
  async online(): Promise<{ online: number }> {
    const now = Date.now();
    if (!this.cached || now - this.cached.at > CACHE_MS) this.cached = { online: await this.realtime.onlineCount(), at: now };
    return { online: this.cached.online };
  }
}
