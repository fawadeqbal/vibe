"use client";

import { useQuery } from "@tanstack/react-query";

import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { Cashout, FinanceSummary, LedgerEntry, Page, Purchase, Subscription } from "@/lib/api/types";

export const financeKeys = {
  all: ["finance"] as const,
  summary: (days: number) => ["finance", "summary", days] as const,
  purchases: (q: Query) => ["finance", "purchases", q] as const,
  purchase: (id: string) => ["finance", "purchase", id] as const,
  cashouts: (q: Query) => ["finance", "cashouts", q] as const,
  ledger: (q: Query) => ["finance", "ledger", q] as const,
  subscriptions: (q: Query) => ["finance", "subscriptions", q] as const,
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
