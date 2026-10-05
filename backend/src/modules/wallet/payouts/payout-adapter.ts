import { PaymentMethod } from '@prisma/client';

/** The full payout destination (decrypted only for the moment of sending). */
export interface PayoutDestination {
  /** 03XXXXXXXXX for wallets, the IBAN for banks. */
  account: string;
  holderName: string;
  bankName?: string;
  cnic?: string;
}

export interface PayoutInput {
  cashoutId: string;
  /** Unique, stable per cash-out: providers use it to refuse duplicates (safe retries). */
  reference: string;
  /** PKR in paisa. */
  amountMinor: number;
  destination: PayoutDestination;
  user: { id: string; email: string | null; name: string };
  /** Set when checking an earlier attempt. */
  providerRef?: string | null;
}

export type PayoutStep =
  | { status: 'paid'; providerRef: string; code?: string; raw?: unknown }
  /** Accepted but not final yet: check later with `check`. */
  | { status: 'pending'; providerRef?: string; code?: string; raw?: unknown }
  /** Needs a person (bank transfers go out in staff batches). */
  | { status: 'manual'; note: string }
  /** Definitely not paid: the gems go back. */
  | { status: 'failed'; reason: string; code?: string; raw?: unknown };

/** One way of paying people out. */
export interface PayoutAdapter {
  readonly method: PaymentMethod;
  readonly provider: string;
  send(input: PayoutInput): Promise<PayoutStep>;
  /** Where an earlier `send` stands (pending / unknown outcomes). */
  check?(input: PayoutInput): Promise<PayoutStep>;
}

export const PAYOUT_METHODS: PaymentMethod[] = [PaymentMethod.JAZZCASH, PaymentMethod.EASYPAISA, PaymentMethod.BANK];
