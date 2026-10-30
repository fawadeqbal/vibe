import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AppConfig } from '../../config/app-config.service';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipMaintenance } from '../settings/maintenance.guard';
import { AttributionDto } from './site.dto';
import { SiteService } from './site.service';

@ApiTags('site')
@Controller('site')
export class SiteController {
  constructor(
    private readonly site: SiteService,
    private readonly config: AppConfig,
  ) {}

  /**
   * "Download for Android" on the marketing site: counts the download, then
   * sends the browser straight to the latest APK (the download starts).
   * `?vid=` (the site visit) and `?b=` (the button) credit where it came from.
   */
  @Public()
  @SkipMaintenance()
  @Get('download/android')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Count an Android download and redirect (302) to the latest APK' })
  async downloadAndroid(@Query('vid') vid: string | undefined, @Query('b') b: string | undefined, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.site.download({ vid, b }, { headers: req.headers, userAgent: req.get('user-agent') ?? null, remoteAddress: req.socket?.remoteAddress ?? null }).catch(() => false);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, this.config.get('APK_DOWNLOAD_URL'));
  }

  /**
   * Beacons from the marketing site (navigator.sendBeacon, text/plain so no
   * CORS preflight): page views, button clicks, time on site. Always 204.
   */
  @Public()
  @SkipMaintenance()
  @Post('events')
  @HttpCode(204)
  @Header('Access-Control-Allow-Origin', '*')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({ summary: 'Marketing-site traffic: { k: view|click|leave, v: visitId, u: visitorId, p: path, r?, b?, t?, l?, s? } (or a list of ≤10)' })
  async events(@Body() body: unknown, @Req() req: Request): Promise<void> {
    await this.site.record(body, { headers: req.headers, userAgent: req.get('user-agent') ?? null, remoteAddress: req.socket?.remoteAddress ?? null });
  }

  @ApiBearerAuth()
  @Post('attribution')
  @HttpCode(200)
  @ApiOperation({ summary: 'A new account opened the app from the marketing site: link that visit (once, accounts under 2 days old)' })
  attribute(@CurrentUser('id') me: string, @Body() dto: AttributionDto) {
    return this.site.attribute(me, dto.visitId);
  }
}
