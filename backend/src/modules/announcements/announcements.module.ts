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
  @ApiOperation({ summary: 'Startup config for the app: maintenance state and minimum version' })
  async config() {
    const s = await this.settings.all();
    return {
      maintenance: { enabled: s['maintenance.enabled'], message: s['maintenance.message'] },
      minVersion: s['app.minVersion'] || null,
      signupsEnabled: s['signups.enabled'],
      matchingEnabled: s['matching.enabled'],
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
