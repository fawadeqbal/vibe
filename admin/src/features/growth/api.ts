"use client";

import { useQuery } from "@tanstack/react-query";

import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { AffiliateDetail, AffiliatePayout, AffiliateStats, AffiliateSummary, Page, ReferralRow, UserReferrals } from "@/lib/api/types";

/** Query keys for growth. Invalidate `growthKeys.all` after any write here. */
export const growthKeys = {
  all: ["growth"] as const,
  referrals: (q: Query) => ["growth", "referrals", q] as const,
  affiliates: (q: Query) => ["growth", "affiliates", q] as const,
  affiliate: (id: string) => ["growth", "affiliate", id] as const,
  stats: (id: string, days: number) => ["growth", "affiliate", id, "stats", days] as const,
  payouts: (q: Query) => ["growth", "payouts", q] as const,
  user: (id: string) => ["growth", "user", id] as const,
};

export function useReferrals(q: Query) {
  return useCursorQuery<ReferralRow>(growthKeys.referrals(q), (cursor, signal) => api.get<Page<ReferralRow>>("admin/referrals", { ...q, cursor, limit: 30 }, signal));
}

export function useAffiliates(q: Query) {
  return useCursorQuery<AffiliateSummary>(growthKeys.affiliates(q), (cursor, signal) => api.get<Page<AffiliateSummary>>("admin/affiliates", { ...q, cursor, limit: 30 }, signal));
}

export function useAffiliate(id: string) {
  return useQuery({ queryKey: growthKeys.affiliate(id), queryFn: ({ signal }) => api.get<AffiliateDetail>(`admin/affiliates/${id}`, undefined, signal) });
}

export function useAffiliateStats(id: string, days: number, initial?: AffiliateStats) {
  return useQuery({
    queryKey: growthKeys.stats(id, days),
    queryFn: ({ signal }) => api.get<AffiliateStats>(`admin/affiliates/${id}/stats`, { days }, signal),
    initialData: days === initial?.days ? initial : undefined,
  });
}

export function useAffiliatePayouts(q: Query) {
  return useCursorQuery<AffiliatePayout>(growthKeys.payouts(q), (cursor, signal) => api.get<Page<AffiliatePayout>>("admin/affiliate-payouts", { ...q, cursor, limit: 30 }, signal));
}

export function useUserReferrals(userId: string, enabled = true) {
  return useQuery({ queryKey: growthKeys.user(userId), queryFn: ({ signal }) => api.get<UserReferrals>(`admin/users/${userId}/referrals`, undefined, signal), enabled });
}
