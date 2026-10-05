"use client";

import { useQuery } from "@tanstack/react-query";

import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { Cashout, FinanceSummary, LedgerEntry, Page, PaymentEvent, PayoutBatch, PayoutBatchDetail, PayoutWaiting, Purchase, Subscription } from "@/lib/api/types";

export const financeKeys = {
  all: ["finance"] as const,
  summary: (days: number) => ["finance", "summary", days] as const,
  purchases: (q: Query) => ["finance", "purchases", q] as const,
  purchase: (id: string) => ["finance", "purchase", id] as const,
  cashouts: (q: Query) => ["finance", "cashouts", q] as const,
  ledger: (q: Query) => ["finance", "ledger", q] as const,
  subscriptions: (q: Query) => ["finance", "subscriptions", q] as const,
  events: (kind: "purchases" | "cashouts", id: string) => ["finance", "events", kind, id] as const,
  batches: ["finance", "batches"] as const,
  batch: (id: string) => ["finance", "batches", id] as const,
  waiting: ["finance", "batches", "waiting"] as const,
};

const list =
  <T>(path: string, key: (q: Query) => readonly unknown[]) =>
  (q: Query) =>
    useCursorQuery<T>(key(q), (cursor, signal) => api.get<Page<T>>(path, { ...q, cursor, limit: 30 }, signal));

export const usePurchases = list<Purchase>("admin/purchases", financeKeys.purchases);
export const useCashouts = list<Cashout>("admin/cashouts", financeKeys.cashouts);
export const useLedger = list<LedgerEntry>("admin/ledger", financeKeys.ledger);
export const useSubscriptions = list<Subscription>("admin/subscriptions", financeKeys.subscriptions);

export function useFinanceSummary(days: number) {
  return useQuery({ queryKey: financeKeys.summary(days), queryFn: ({ signal }) => api.get<FinanceSummary>("admin/finance/summary", { days }, signal) });
}

export function usePurchase(id: string | null) {
  return useQuery({ queryKey: financeKeys.purchase(id ?? ""), queryFn: ({ signal }) => api.get<Purchase>(`admin/purchases/${id}`, undefined, signal), enabled: !!id });
}

export const METHODS = ["GOOGLE_PLAY", "APP_STORE", "JAZZCASH", "EASYPAISA", "CARD", "BANK"];

/** Every step with the provider for a purchase or cash-out, oldest first. */
export function usePaymentEvents(kind: "purchases" | "cashouts", id: string | null) {
  return useQuery({ queryKey: financeKeys.events(kind, id ?? ""), queryFn: ({ signal }) => api.get<PaymentEvent[]>(`admin/${kind}/${id}/events`, undefined, signal), enabled: !!id });
}

export function usePayoutWaiting() {
  return useQuery({ queryKey: financeKeys.waiting, queryFn: ({ signal }) => api.get<PayoutWaiting>("admin/payout-batches/waiting", undefined, signal), refetchInterval: 60_000 });
}

export function usePayoutBatches() {
  return useQuery({ queryKey: financeKeys.batches, queryFn: ({ signal }) => api.get<PayoutBatch[]>("admin/payout-batches", undefined, signal) });
}

export function usePayoutBatch(id: string) {
  return useQuery({ queryKey: financeKeys.batch(id), queryFn: ({ signal }) => api.get<PayoutBatchDetail>(`admin/payout-batches/${id}`, undefined, signal) });
}
