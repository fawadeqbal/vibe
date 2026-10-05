import { PaymentMethod } from '@prisma/client';

import { localMobile } from '../../payments/adapters/pk-format';

/** ISO 13616 check (mod 97) for any IBAN; Pakistan's are 24 characters: PKkk BBBB 16 digits. */
export function validIban(raw: string): string | null {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  if (iban.startsWith('PK') && !/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) return null;
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of moved) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? iban : null;
}

/** Normalises the account for its method, or explains what's wrong. */
export function normaliseAccount(method: PaymentMethod, account: string): { ok: true; value: string } | { ok: false; message: string } {
  if (method === PaymentMethod.BANK) {
    const iban = validIban(account);
    return iban ? { ok: true, value: iban } : { ok: false, message: 'Enter a valid IBAN, e.g. PK36SCBL0000001123456702' };
  }
  const mobile = localMobile(account);
  return mobile ? { ok: true, value: mobile } : { ok: false, message: 'Enter the wallet number like 03001234567' };
}

export function maskDestination(method: PaymentMethod, value: string): string {
  return method === PaymentMethod.BANK ? `${value.slice(0, 4)} •••• ${value.slice(-4)}` : `${value.slice(0, 4)}•••${value.slice(-3)}`;
}
