import type { LedgerEntry, LedgerKind, PaymentMethod } from '@prisma/client';

import type { Tx } from '../../infra/prisma/prisma.service';

export interface Movement {
  /** Positive credits, negative debits. */
  coins?: number;
  gems?: number;
  kind: LedgerKind;
  title: string;
  usdCents?: number;
  method?: PaymentMethod;
  reference?: string;
  /** Same key twice for the same user = applied once. */
  idempotencyKey?: string;
}

export interface MoveOptions {
  tx?: Tx;
}

export interface MoveResult {
  entry: LedgerEntry;
  coins: number;
  gems: number;
  /** False when the idempotency key had already been applied. */
  applied: boolean;
}

export const WALLET_CHANGED = 'wallet.changed';
export interface WalletChangedEvent {
  userIds: string[];
}
