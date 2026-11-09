import { Module } from '@nestjs/common';

import { CashoutService } from './cashout.service';
import { LedgerService } from './ledger.service';
import { AdViews } from './ads/ad-views';
import { AdMobProvider } from './ads/admob.provider';
import { AdsService } from './ads/ads.service';
import { MonetagProvider } from './ads/monetag.provider';
import { PayoutAccountsService } from './payouts/payout-accounts.service';
import { PayoutBatchesService } from './payouts/payout-batches.service';
import { PayoutGateway } from './payouts/payout-gateway.service';
import { RewardsService } from './rewards.service';
import { AdMobWebhookController, MonetagWebhookController, WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, AdMobWebhookController, MonetagWebhookController],
  providers: [
    LedgerService,
    WalletService,
    RewardsService,
    CashoutService,
    AdViews,
    AdMobProvider,
    MonetagProvider,
    AdsService,
    PayoutGateway,
    PayoutAccountsService,
    PayoutBatchesService,
  ],
  exports: [LedgerService, WalletService, RewardsService, CashoutService, PayoutAccountsService, PayoutBatchesService, PayoutGateway],
})
export class WalletModule {}
