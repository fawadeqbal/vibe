import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { AffiliatesService } from './affiliates.service';
import { AffiliateController, ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/**
 * Growth: user referrals and creator partners (affiliates). Listens to
 * sign-ups, verification, calls and purchases (events), so nothing else
 * depends on it; the admin panel uses its services.
 */
@Module({
  imports: [WalletModule, PaymentsModule],
  controllers: [ReferralsController, AffiliateController],
  providers: [ReferralsService, AffiliatesService],
  exports: [ReferralsService, AffiliatesService],
})
export class ReferralsModule {}
