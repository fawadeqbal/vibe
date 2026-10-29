import { Module } from '@nestjs/common';

import { SocialModule } from '../social/social.module';
import { WalletModule } from '../wallet/wallet.module';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

/** Discover: the swipe deck. Matches become friends (SocialModule). */
@Module({
  imports: [SocialModule, WalletModule],
  controllers: [DiscoverController],
  providers: [DiscoverService],
  exports: [DiscoverService],
})
export class DiscoverModule {}
