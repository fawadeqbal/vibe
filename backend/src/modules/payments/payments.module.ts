import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { PaymentGateway } from './payment-gateway.service';
import { DevCheckoutController, PaymentWebhooksController } from './payment-webhooks.controller';
import { PaymentWebhookHandlers } from './payment-webhooks.service';
import { PaymentsController, VipController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StoreSubscriptionsService } from './store-subscriptions.service';
import { VipService } from './vip.service';

/**
 * Money in: purchases (PaymentsService) over per-method adapters
 * (PaymentGateway), store subscription life (StoreSubscriptionsService),
 * provider callbacks (PaymentWebhooksController → WebhookInbox →
 * PaymentWebhookHandlers) and VIP.
 */
@Module({
  imports: [WalletModule],
  controllers: [PaymentsController, VipController, PaymentWebhooksController, DevCheckoutController],
  providers: [PaymentsService, VipService, PaymentGateway, StoreSubscriptionsService, PaymentWebhookHandlers],
  exports: [PaymentsService, VipService, PaymentGateway],
})
export class PaymentsModule {}
