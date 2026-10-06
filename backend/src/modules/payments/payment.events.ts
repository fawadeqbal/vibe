/**
 * Money-in events other modules react to (affiliate commissions) without
 * depending on the payments module. Emitted after the transaction commits.
 */
export const PURCHASE_SUCCEEDED = 'payments.purchase-succeeded';
export const PURCHASE_REFUNDED = 'payments.purchase-refunded';

export interface PurchaseEvent {
  purchaseId: string;
  userId: string;
}
