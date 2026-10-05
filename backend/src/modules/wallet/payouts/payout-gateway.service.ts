import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AppConfig } from '../../../config/app-config.service';
import { Integration, IntegrationMode, IntegrationReporter, IntegrationStatus, missingKeys, ProviderSwitch, resolveMode } from '../../../integrations/core/integration.types';
import { readSecret } from '../../../integrations/core/secrets';
import { BankBatchPayoutAdapter, DevPayoutAdapter } from './dev.payout';
import { EasypaisaPayoutAdapter } from './easypaisa.payout';
import { JazzCashPayoutAdapter } from './jazzcash.payout';
import { PayoutAdapter } from './payout-adapter';

const LABEL: Record<string, string> = { JAZZCASH: 'JazzCash payouts', EASYPAISA: 'Easypaisa payouts', BANK: 'Bank payouts (staff batches)' };

/** One payout adapter per method, chosen from PAYOUTS_PROVIDER and the keys present. */
@Integration()
@Injectable()
export class PayoutGateway implements IntegrationReporter {
  private readonly slots = new Map<PaymentMethod, { mode: IntegrationMode; adapter?: PayoutAdapter; requiredEnv: string[]; notes: string[] }>();

  constructor(private readonly config: AppConfig) {
    const sw = config.get('PAYOUTS_PROVIDER') as ProviderSwitch;
    const add = (method: PaymentMethod, required: string[], live: () => PayoutAdapter, notes: string[] = []) => {
      const mode = resolveMode(sw, missingKeys(config.env, required).length === 0, config.isProduction);
      this.slots.set(method, { mode, requiredEnv: required, notes, adapter: mode === 'live' ? live() : mode === 'dev' ? new DevPayoutAdapter(method) : undefined });
    };
    add(
      PaymentMethod.JAZZCASH,
      ['JAZZCASH_DISBURSE_BASE_URL', 'JAZZCASH_DISBURSE_CLIENT_ID', 'JAZZCASH_DISBURSE_CLIENT_SECRET', 'JAZZCASH_DISBURSE_USERNAME', 'JAZZCASH_DISBURSE_PASSWORD'],
      () =>
        new JazzCashPayoutAdapter({
          baseUrl: config.get('JAZZCASH_DISBURSE_BASE_URL'),
          clientId: config.get('JAZZCASH_DISBURSE_CLIENT_ID'),
          clientSecret: readSecret(config.get('JAZZCASH_DISBURSE_CLIENT_SECRET'))!,
          username: config.get('JAZZCASH_DISBURSE_USERNAME'),
          password: readSecret(config.get('JAZZCASH_DISBURSE_PASSWORD'))!,
          aesKey: readSecret(config.get('JAZZCASH_DISBURSE_AES_KEY')),
        }),
      ['Check JAZZCASH_DISBURSE_API in jazzcash.payout.ts against the spec JazzCash sends with the disbursement agreement.'],
    );
    add(
      PaymentMethod.EASYPAISA,
      ['EASYPAISA_DISBURSE_BASE_URL', 'EASYPAISA_DISBURSE_CLIENT_ID', 'EASYPAISA_DISBURSE_CLIENT_SECRET', 'EASYPAISA_DISBURSE_ACCOUNT'],
      () =>
        new EasypaisaPayoutAdapter({
          baseUrl: config.get('EASYPAISA_DISBURSE_BASE_URL'),
          clientId: config.get('EASYPAISA_DISBURSE_CLIENT_ID'),
          clientSecret: readSecret(config.get('EASYPAISA_DISBURSE_CLIENT_SECRET'))!,
          account: config.get('EASYPAISA_DISBURSE_ACCOUNT'),
        }),
      ['Check EASYPAISA_DISBURSE_API in easypaisa.payout.ts against the spec Easypaisa sends with the disbursement account.'],
    );
    this.slots.set(PaymentMethod.BANK, { mode: sw === 'dev' ? 'dev' : 'live', adapter: new BankBatchPayoutAdapter(), requiredEnv: [], notes: ['Staff export a batch CSV in Finance → Payout batches, pay it in the bank portal, then mark it paid.'] });
  }

  adapter(method: PaymentMethod): PayoutAdapter {
    const a = this.slots.get(method)?.adapter;
    if (!a) throw new AppError(ErrorCode.VALIDATION_FAILED, `${LABEL[method] ?? method} aren't available right now`, HttpStatus.SERVICE_UNAVAILABLE);
    return a;
  }

  available(): PaymentMethod[] {
    return [...this.slots.entries()].filter(([, s]) => s.adapter).map(([m]) => m);
  }

  integrationStatus(): IntegrationStatus[] {
    return [...this.slots.entries()].map(([method, s]) => ({
      key: `payouts.${method.toLowerCase()}`,
      kind: 'payout' as const,
      label: LABEL[method],
      mode: s.mode,
      requiredEnv: s.requiredEnv,
      missingEnv: missingKeys(this.config.env, s.requiredEnv),
      notes: s.notes,
    }));
  }
}
