import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SettingsService } from '../settings/settings.service';
import { SkipMaintenance } from '../settings/maintenance.guard';
import { WalletModule } from '../wallet/wallet.module';
import { AnnouncementsService } from './announcements.service';

@ApiTags('app')
@Controller()
export class AppInfoController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @SkipMaintenance()
  @Get('config')
  @ApiOperation({ summary: 'Startup config for the app: maintenance state, minimum version, Monetag zone for /ad-frame' })
  async config() {
    const s = await this.settings.all();
    const zone = s['ads.monetagZoneId'].trim();
    return {
      maintenance: { enabled: s['maintenance.enabled'], message: s['maintenance.message'] },
      minVersion: s['app.minVersion'] || null,
      signupsEnabled: s['signups.enabled'],
      matchingEnabled: s['matching.enabled'],
      // Public anyway (it is in the page that shows the ad). The web's /ad-frame reads it from here, never from its URL.
      monetag: zone ? { zoneId: zone, sdkUrl: s['ads.monetagSdkUrl'] } : null,
      // The landing page loads its Vignette only when this is set (Settings → Ads).
      landingAd: s['ads.landingVignette'] && s['ads.landingVignetteZoneId'] ? { zoneId: s['ads.landingVignetteZoneId'], src: s['ads.landingVignetteScript'] } : null,
    };
  }

  @ApiBearerAuth()
  @Get('announcements')
  @ApiOperation({ summary: 'Live announcements for the signed-in person' })
  list(@CurrentUser('id') userId: string) {
    return this.announcements.forUser(userId);
  }
}

@Module({
  imports: [WalletModule],
  controllers: [AppInfoController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
