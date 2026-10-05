import { PaymentMethod } from '@prisma/client';

import { maskDestination, normaliseAccount, validIban } from './account-rules';
import { EasypaisaPayoutAdapter } from './easypaisa.payout';
import { JAZZCASH_DISBURSE_API, JazzCashPayoutAdapter } from './jazzcash.payout';
import { PayoutInput } from './payout-adapter';

const input: PayoutInput = { cashoutId: 'c1', reference: 'Vabc', amountMinor: 700000, destination: { account: '03001234567', holderName: 'Sara' }, user: { id: 'u1', email: null, name: 'Sara' } };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

describe('payout account rules', () => {
  it('IBAN mod-97 and Pakistan shape', () => {
    expect(validIban('PK36SCBL0000001123456702')).toBe('PK36SCBL0000001123456702');
    expect(validIban('pk36 scbl 0000 0011 2345 6702')).toBe('PK36SCBL0000001123456702');
    expect(validIban('PK36SCBL0000001123456703')).toBeNull();
    expect(validIban('GB82WEST12345698765432')).toBe('GB82WEST12345698765432');
    expect(normaliseAccount(PaymentMethod.JAZZCASH, '923001234567')).toEqual({ ok: true, value: '03001234567' });
    expect(maskDestination(PaymentMethod.BANK, 'PK36SCBL0000001123456702')).toBe('PK36 •••• 6702');
  });
});

describe('JazzCash disbursement', () => {
  const make = (route: (path: string) => Response | Promise<Response>) =>
    new JazzCashPayoutAdapter({ baseUrl: 'https://jc.test', clientId: 'id', clientSecret: 's', username: 'u', password: 'p' }, async (i) => route(new URL(i).pathname));

  it('gets a token once, sends, maps success', async () => {
    let tokens = 0;
    const a = make((path) => {
      if (path === JAZZCASH_DISBURSE_API.tokenPath) {
        tokens++;
        return json({ access_token: 'tkn', expires_in: 3600 });
      }
      return json({ responseCode: 'G2P-T-0', transactionID: 'JC1' });
    });
    expect(await a.send(input)).toMatchObject({ status: 'paid', providerRef: 'JC1' });
    expect(await a.send(input)).toMatchObject({ status: 'paid' });
    expect(tokens).toBe(1);
  });

  it('never fails a payout on an unknown answer or a timeout', async () => {
    const odd = make((path) => (path === JAZZCASH_DISBURSE_API.tokenPath ? json({ access_token: 't' }) : json({ responseCode: 'X-42', responseDescription: 'Something new' })));
    expect(await odd.send(input)).toMatchObject({ status: 'pending', code: 'X-42: Something new' });
    const slow = make((path) => {
      if (path === JAZZCASH_DISBURSE_API.tokenPath) return json({ access_token: 't' });
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    });
    expect(await slow.send(input)).toMatchObject({ status: 'pending' });
  });
});

describe('Easypaisa disbursement', () => {
  it('sends with client headers and maps 0000 to paid', async () => {
    let headers: Record<string, string> = {};
    const a = new EasypaisaPayoutAdapter({ baseUrl: 'https://ep.test', clientId: 'cid', clientSecret: 'sec', account: '0345' }, async (_i, init) => {
      headers = init?.headers as Record<string, string>;
      return json({ ResponseCode: '0000', TransactionId: 'EP1' });
    });
    expect(await a.send(input)).toMatchObject({ status: 'paid', providerRef: 'EP1' });
    expect(headers['X-IBM-Client-Id']).toBe('cid');
  });
});
