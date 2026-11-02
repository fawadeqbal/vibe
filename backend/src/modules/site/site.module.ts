import { Module } from '@nestjs/common';

import { AppDownloadService } from './app-download.service';
import { GeoService } from './geo.service';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

/** Marketing-site traffic: visits, clicks to the app, sources, countries (admin → Marketing site). */
@Module({
  controllers: [SiteController],
  providers: [SiteService, GeoService, AppDownloadService],
  exports: [SiteService, GeoService, AppDownloadService],
})
export class SiteModule {}
