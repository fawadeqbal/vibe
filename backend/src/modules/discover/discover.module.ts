import { Module } from '@nestjs/common';

import { FiltersModule } from '../filters/filters.module';
import { SocialModule } from '../social/social.module';
import { WalletModule } from '../wallet/wallet.module';
import { DiscoverController } from './discover.controller';
import { DiscoverReturnService } from './discover-return.service';
import { DiscoverService } from './discover.service';

/** Discover: the swipe deck. Matches become friends (SocialModule). */
@Module({
  imports: [SocialModule, WalletModule, FiltersModule],
  controllers: [DiscoverController],
  providers: [DiscoverService, DiscoverReturnService],
  exports: [DiscoverService],
})
export class DiscoverModule {}
