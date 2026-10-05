import type { PaymentMethod } from "./models";

/**
 * Client-side checks that mirror the server's (`pk-format.ts`,
 * `account-rules.ts`), so people see a mistake before a round trip. The
 * server still validates everything.
 */

/** Any Pakistani mobile format → `03XXXXXXXXX`, or null. */
export function localMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const m = /^(?:0092|92|0)?(3\d{9})$/.exec(digits);
  return m ? `0${m[1]}` : null;
}

/** ISO 13616 (mod 97) check; Pakistani IBANs are `PKkk BBBB` + 16 digits. Normalised IBAN or null. */
export function iban(raw: string): string | null {
  const v = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return null;
  if (v.startsWith("PK") && !/^PK\d{2}[A-Z]{4}\d{16}$/.test(v)) return null;
  const moved = `${v.slice(4)}${v.slice(0, 4)}`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of moved) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? v : null;
}

export const cnicLast6 = (raw: string) => /^\d{6}$/.test(raw.trim());

export const cnic = (raw: string) => /^\d{5}-?\d{7}-?\d$/.test(raw.trim());

/** Problems with a new payout account, by field. Empty = fine to send. */
export function payoutAccountErrors(input: { method: PaymentMethod; account: string; holderName: string; bankName?: string; cnic?: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.method === "bank") {
    if (!iban(input.account)) errors.account = "Enter a valid IBAN, e.g. PK36SCBL0000001123456702";
    if ((input.bankName ?? "").trim().length < 2) errors.bankName = "Enter the bank name";
  } else if (input.method === "jazzCash" || input.method === "easypaisa") {
    if (!localMobile(input.account)) errors.account = "Enter the wallet number like 03001234567";
  } else {
    errors.account = "Choose JazzCash, Easypaisa or a bank account";
  }
  const name = input.holderName.trim();
  if (name.length < 2 || name.length > 80) errors.holderName = "Enter the name on the account";
  if (input.cnic && input.cnic.trim() && !cnic(input.cnic)) errors.cnic = "CNIC looks like 35202-1234567-1";
  return errors;
}

/** The account as the server wants it (03… or IBAN), assuming it validated. */
export const normaliseAccount = (method: PaymentMethod, account: string) =>
  method === "bank" ? (iban(account) ?? account.trim()) : (localMobile(account) ?? account.trim());
