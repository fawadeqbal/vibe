import { Module } from '@nestjs/common';

import { CashoutService } from './cashout.service';
import { LedgerService } from './ledger.service';
import { AdsService } from './ads/ads.service';
import { PayoutAccountsService } from './payouts/payout-accounts.service';
import { PayoutBatchesService } from './payouts/payout-batches.service';
import { PayoutGateway } from './payouts/payout-gateway.service';
import { RewardsService } from './rewards.service';
import { AdMobWebhookController, WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, AdMobWebhookController],
  providers: [
    LedgerService,
    WalletService,
    RewardsService,
    CashoutService,
    AdsService,
    PayoutGateway,
    PayoutAccountsService,
    PayoutBatchesService,
  ],
  exports: [LedgerService, WalletService, RewardsService, CashoutService, PayoutAccountsService, PayoutBatchesService, PayoutGateway],
})
export class WalletModule {}
