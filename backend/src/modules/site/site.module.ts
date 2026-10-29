import { Module } from '@nestjs/common';

import { GeoService } from './geo.service';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

/** Marketing-site traffic: visits, clicks to the app, sources, countries (admin → Marketing site). */
@Module({
  controllers: [SiteController],
  providers: [SiteService, GeoService],
  exports: [SiteService, GeoService],
})
export class SiteModule {}
