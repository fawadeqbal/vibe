import { Global, Module } from '@nestjs/common';

import { SiteModule } from '../site/site.module';
import { RegionGuard } from './region.guard';
import { RegionService } from './region.service';

/** Countries Vibe isn't offered in: the request guard and the profile/phone/payment checks. */
@Global()
@Module({ imports: [SiteModule], providers: [RegionService, RegionGuard], exports: [RegionService, RegionGuard] })
export class RegionModule {}
