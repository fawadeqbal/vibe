import type { AppConfig } from '../../../../config/app-config.service';
import type { PaymentContext } from '../payment-adapter';
import { CardAdapter } from './card.adapter';
import type { CardGateway, CardStatus, CheckoutInput } from './card-gateway';

function setup(status: CardStatus) {
  const seen: CheckoutInput[] = [];
  const gateway: CardGateway = {
    name: 'fake',
    requiredEnv: [],
    createCheckout: async (i) => (seen.push(i), { sessionRef: 'cs_1', redirectUrl: 'https://pay.example/cs_1' }),
    getStatus: async () => status,
    parseWebhook: async () => null,
  };
  const config = { get: () => 'https://app.example/done', url: (p: string) => `https://api.example${p}` } as unknown as AppConfig;
  const adapter = new CardAdapter(gateway, config, async () => new Set(['IN', 'IL', 'AF']));
  const ctx = { purchase: { id: 'p1', providerRef: 'cs_1' }, amount: { currency: 'PKR', minor: 28000 }, title: 'Starter pack', user: { id: 'u1', email: null, name: 'A' }, input: {} } as unknown as PaymentContext;
  return { adapter, ctx, seen };
}

describe('CardAdapter and blocked countries', () => {
  it('tells the gateway which issuer countries to decline', async () => {
    const { adapter, ctx, seen } = setup({ status: 'pending' });
    await adapter.start(ctx);
    expect(seen[0].blockedCardCountries).toEqual(['AF', 'IL', 'IN']);
  });

  it('refuses a paid card issued in a blocked country and flags a refund', async () => {
    const { adapter, ctx } = setup({ status: 'paid', providerRef: 'ch_1', cardCountry: 'in' });
    expect(await adapter.check(ctx)).toMatchObject({ status: 'failed', code: 'CARD_REGION', raw: { refundNeeded: true, cardCountry: 'IN' } });
  });

  it('delivers cards from anywhere else', async () => {
    const { adapter, ctx } = setup({ status: 'paid', providerRef: 'ch_1', cardCountry: 'PK' });
    expect(await adapter.check(ctx)).toEqual({ status: 'succeeded', providerRef: 'ch_1' });
  });
});
