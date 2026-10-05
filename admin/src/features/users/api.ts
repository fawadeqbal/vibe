"use client";

import { useQuery } from "@tanstack/react-query";

import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { AuditEntry, Cashout, LedgerEntry, MatchRow, Page, Purchase, Report, StaffNote, UserDetail, UserSummary, Verification } from "@/lib/api/types";

/** Query keys for users. Invalidate `userKeys.all` after any user write. */
export const userKeys = {
  all: ["users"] as const,
  lists: () => ["users", "list"] as const,
  list: (q: Query) => ["users", "list", q] as const,
  detail: (id: string) => ["users", "detail", id] as const,
  sub: (id: string, what: string, q?: Query) => ["users", "detail", id, what, q ?? {}] as const,
};

export function useUsers(q: Query) {
  return useCursorQuery<UserSummary>(userKeys.list(q), (cursor, signal) => api.get<Page<UserSummary>>("admin/users", { ...q, cursor, limit: 30 }, signal));
}

export function useUser(id: string) {
  return useQuery({ queryKey: userKeys.detail(id), queryFn: ({ signal }) => api.get<UserDetail>(`admin/users/${id}`, undefined, signal) });
}

const sub =
  <T>(path: string) =>
  (id: string, q: Query = {}, enabled = true) =>
    useCursorQuery<T>(userKeys.sub(id, path, q), (cursor, signal) => api.get<Page<T>>(`admin/users/${id}/${path}`, { ...q, cursor, limit: 25 }, signal), { enabled });

export const useUserLedger = sub<LedgerEntry>("ledger");
export const useUserMatches = sub<MatchRow>("matches");
export const useUserReports = sub<Report>("reports");
export const useUserPurchases = sub<Purchase>("purchases");
export const useUserCashouts = sub<Cashout>("cashouts");
export const useUserAudit = sub<AuditEntry>("audit");

export function useUserNotes(id: string, enabled = true) {
  return useQuery({ queryKey: userKeys.sub(id, "notes"), queryFn: ({ signal }) => api.get<StaffNote[]>(`admin/users/${id}/notes`, undefined, signal), enabled });
}

export const verificationKeys = {
  all: ["verifications"] as const,
  list: (status: string) => ["verifications", status] as const,
};

/** Selfie verifications by status (oldest first, up to 100). */
export function useVerifications(status: string) {
  return useQuery({ queryKey: verificationKeys.list(status), queryFn: ({ signal }) => api.get<Verification[]>("admin/verifications", { status }, signal), refetchInterval: status === "PENDING" ? 30_000 : undefined });
}
