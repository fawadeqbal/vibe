import { Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CashoutService } from './cashout.service';
import { LedgerService } from './ledger.service';
import { AdMobAdVerifier, AdVerifier, DevAdVerifier } from './providers/ad-verifier';
import { DevPayoutProvider, PayoutProvider } from './providers/payout.provider';
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
    {
      provide: AdVerifier,
      inject: [AppConfig, RedisService],
      useFactory: (config: AppConfig, redis: RedisService) => (config.get('ADS_VERIFIER') === 'admob' ? new AdMobAdVerifier(redis) : new DevAdVerifier(redis)),
    },
    { provide: PayoutProvider, useClass: DevPayoutProvider },
  ],
  exports: [LedgerService, WalletService, RewardsService, CashoutService],
})
export class WalletModule {}
