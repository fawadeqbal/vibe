import { Module } from '@nestjs/common';

import { SiteController } from './site.controller';
import { SiteService } from './site.service';

/** Marketing-site traffic: visits, clicks to the app, sources, countries (admin → Marketing site). */
@Module({
  controllers: [SiteController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
