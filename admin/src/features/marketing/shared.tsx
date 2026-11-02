"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Segmented } from "@/components/ui/controls";
import { api } from "@/lib/api/client";
import type { MarketingReport } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const marketingKeys = {
  report: (days: number) => ["dashboard", "marketing", days] as const,
};

const DAYS = [1, 7, 30, 90] as const;

/** The period lives in the URL (?days=30), so "See all" pages and reloads keep it. */
export function useDays(): [number, (d: number) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const raw = Number(params.get("days"));
  const days = (DAYS as readonly number[]).includes(raw) ? raw : 7;
  const set = (d: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("days", String(d));
    next.delete("page");
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  return [days, set];
}

export function useMarketing(days: number) {
  return useQuery({
    queryKey: marketingKeys.report(days),
    queryFn: ({ signal }) => api.get<MarketingReport>("admin/dashboard/marketing", { days }, signal),
    refetchInterval: 60_000,
  });
}

export function DaysSwitch({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: 1, label: "Today" },
        { value: 7, label: "7 days" },
        { value: 30, label: "30 days" },
        { value: 90, label: "90 days" },
      ]}
    />
  );
}

export const periodLabel = (days: number) => (days === 1 ? "the last 24 hours" : `the last ${days} days`);

/** "Top 5 of 7 channels" and a button to the full list. */
export function SeeAll({ shown, total, noun, href, className }: { shown: number; total: number; noun: string; href: string; className?: string }) {
  if (total <= 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted", className)}>
      <span>{total > shown ? `Top ${shown} of ${total} ${noun}` : `All ${total} ${noun}`}</span>
      <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-3 font-medium text-text shadow-card hover:bg-surface-2">
        See all
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

/** A thin bar for a share (0–1). */
export function Meter({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}>
      <div className={cn("h-full rounded-full bg-primary", barClassName)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export const share = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
