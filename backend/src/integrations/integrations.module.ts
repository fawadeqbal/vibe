import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { IntegrationRegistry } from './core/integration-registry.service';
import { PaymentEvents } from './core/payment-events.service';
import { WebhookInbox } from './core/webhook-inbox.service';
import { GoogleAuth } from './google/google-auth';
import { AppleJwsVerifier } from './apple/apple-jws';

/**
 * Shared plumbing for everything that talks to an outside provider:
 * status registry, webhook inbox, payment event trail, Google service-account
 * tokens and Apple signed-data verification. Feature modules hold the adapters.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [IntegrationRegistry, WebhookInbox, PaymentEvents, GoogleAuth, AppleJwsVerifier],
  exports: [IntegrationRegistry, WebhookInbox, PaymentEvents, GoogleAuth, AppleJwsVerifier],
})
export class IntegrationsModule {}
