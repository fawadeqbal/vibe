import { Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.service';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController, PaymentWebhookController, VipController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { DevPaymentProvider } from './providers/dev-payment.provider';
import { LivePaymentProvider } from './providers/live-payment.provider';
import { PaymentProvider } from './providers/payment.provider';
import { VipService } from './vip.service';

@Module({
  imports: [WalletModule],
  controllers: [PaymentsController, VipController, PaymentWebhookController],
  providers: [
    PaymentsService,
    VipService,
    { provide: PaymentProvider, inject: [AppConfig], useFactory: (c: AppConfig) => (c.get('PAYMENTS_PROVIDER') === 'live' ? new LivePaymentProvider() : new DevPaymentProvider(c)) },
  ],
  exports: [PaymentsService, VipService],
})
export class PaymentsModule {}
