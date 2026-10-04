import type { PaymentMethod, ProductType } from '@prisma/client';

export interface ChargeInput {
  purchaseId: string;
  userId: string;
  method: PaymentMethod;
  productType: ProductType;
  productId: string;
  usdCents: number;
  /** Store purchase token (Google Play) / transaction id (App Store). */
  receipt?: string;
  /** Mobile-wallet number (JazzCash / Easypaisa). */
  phone?: string;
  /** Tokenised card from the gateway's client SDK — never a raw PAN. */
  cardToken?: string;
}

export type ChargeResult =
  | { status: 'succeeded'; providerRef: string }
  | { status: 'requires_action'; action: 'otp' | 'bank_transfer'; providerRef?: string; instructions?: string }
  | { status: 'failed'; reason: string };

/**
 * One interface for every way money comes in. `charge` starts a payment;
 * `confirm` completes a step the user had to take (wallet OTP).
 */
export abstract class PaymentProvider {
  abstract charge(input: ChargeInput): Promise<ChargeResult>;
  abstract confirm(input: ChargeInput & { providerRef?: string; otp: string }): Promise<ChargeResult>;
}
