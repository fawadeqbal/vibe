"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { Page, Report, ReportDetail, ReportedPerson, ReportStats } from "@/lib/api/types";

export const reportKeys = {
  all: ["reports"] as const,
  list: (q: Query) => ["reports", "list", q] as const,
  byPerson: ["reports", "by-person"] as const,
  stats: ["reports", "stats"] as const,
  detail: (id: string) => ["reports", "detail", id] as const,
};

export function useReports(q: Query) {
  return useCursorQuery<Report>(reportKeys.list(q), (cursor, signal) => api.get<Page<Report>>("admin/reports", { ...q, cursor, limit: 30 }, signal));
}

export function useReportStats() {
  return useQuery({ queryKey: reportKeys.stats, queryFn: ({ signal }) => api.get<ReportStats>("admin/reports/stats", undefined, signal), refetchInterval: 30_000 });
}

/** Offset-paged (the queue is bounded by open reports). */
export function useReportedPeople() {
  const q = useInfiniteQuery({
    queryKey: reportKeys.byPerson,
    queryFn: ({ pageParam, signal }) => api.get<{ items: ReportedPerson[]; nextOffset: number | null }>("admin/reports/by-person", { offset: pageParam, limit: 30 }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    refetchInterval: 30_000,
  });
  return { ...q, rows: q.data?.pages.flatMap((p) => p.items) ?? [] };
}

export function useReport(id: string) {
  return useQuery({ queryKey: reportKeys.detail(id), queryFn: ({ signal }) => api.get<ReportDetail>(`admin/reports/${id}`, undefined, signal) });
}
