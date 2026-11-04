"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type * as React from "react";

import { Skeleton, Segmented } from "@/components/ui/controls";
import { api } from "@/lib/api/client";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ClientFilter = "all" | "app" | "web";

export interface Kpis {
  goodCalls: number;
  active: number;
  signups: number;
  goodFirstCall: number;
  cameBack: number;
  cameBackEligible: number;
  revenueUsd: number;
}
export interface Note {
  tone: "good" | "bad" | "info";
  text: string;
}
export interface HealthReport {
  generatedAt: string;
  days: number;
  current: Kpis;
  previous: Kpis;
  daily: {
    day: string;
    goodCalls: number;
    active: number;
    signups: number;
    revenueUsd: number;
  }[];
  notes: Note[];
  attention: {
    key: string;
    text: string;
    href: string;
    tone: "bad" | "warn";
  }[];
}
export interface MatchingReport {
  generatedAt: string;
  days: number;
  collectingSince: string | null;
  searches: {
    total: number;
    matched: number;
    gaveUp: number;
    gaveUpRate: number | null;
    avgWaitSec: number | null;
    p50WaitSec: number | null;
    p90WaitSec: number | null;
    rematchSoon: number;
  };
  heatmap: {
    dow: number;
    hour: number;
    searches: number;
    avgWaitSec: number | null;
    gaveUp: number;
  }[];
  byHour: {
    hour: number;
    searches: number;
    avgWaitSec: number | null;
    gaveUpRate: number | null;
  }[];
  calls: {
    total: number;
    avgSeconds: number;
    quick: number;
    quickRate: number | null;
    good: number;
    goodRate: number | null;
    reports: number;
    reportsPer100: number | null;
  };
}
export interface SourceRow {
  source: string;
  visitors: number;
  downloads: number;
  signups: number;
  setUp: number;
  firstCall: number;
  goodFirstCall: number;
  cameBack: number;
  cameBackEligible: number;
  week: number;
  weekEligible: number;
  paid: number;
}
export interface GrowthReport {
  generatedAt: string;
  days: number;
  sources: SourceRow[];
  total: SourceRow;
  /** Sign-ups per day by where the account was made (other = before that was recorded). */
  daily: { day: string; app: number; web: number; other: number; total: number }[];
  cohorts: {
    week: string;
    signups: number;
    d1: number | null;
    d7: number | null;
    d30: number | null;
  }[];
}
export interface MoneyReport {
  generatedAt: string;
  days: number;
  revenueUsd: number;
  purchases: number;
  payers: number;
  activePeople: number;
  payingShare: number | null;
  arppuUsd: number | null;
  firstTimePayers: number;
  medianDaysToFirstPurchase: number | null;
  repeatPayers: number;
  products: {
    type: string;
    productId: string;
    purchases: number;
    revenueUsd: number;
  }[];
  previousRevenueUsd: number;
}

/** GET admin/insights/<what>?days=&client= (cached 60 s on the server). */
export function useInsights<T>(what: "health" | "matching" | "growth" | "money", days: number, client: ClientFilter = "all") {
  return useQuery({
    queryKey: ["insights", what, days, client],
    queryFn: ({ signal }) => api.get<T>(`admin/insights/${what}`, { days, client }, signal),
    refetchInterval: 60_000,
  });
}

export const pct = (n: number | null | undefined) => (n == null ? "—" : format.percent(n));
export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** 22 → "10pm". */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

const SOURCES: Record<string, string> = {
  invite: "Invites",
  partner: "Creator partners",
  direct: "Typed the site address",
  no_site_visit: "No site visit (app or shared APK)",
  tiktok: "TikTok",
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
  x: "X",
  all: "All",
};
export const sourceLabel = (s: string) => SOURCES[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : s);

export function DaysSwitch({ value, onChange, today = true }: { value: number; onChange: (d: number) => void; today?: boolean }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[...(today ? [{ value: 1, label: "Today" }] : []), { value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }]}
    />
  );
}

export function ClientSwitch({ value, onChange }: { value: ClientFilter; onChange: (c: ClientFilter) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "all", label: "Everyone" },
        { value: "app", label: "App" },
        { value: "web", label: "Web" },
      ]}
    />
  );
}

/**
 * ▲ 12% / ▼ 30% against the window before. Green when the move is good
 * (up, or down for "lower is better"); flat under 3%; nothing to compare = "—".
 */
export function Delta({ cur, prev, lowerIsBetter = false, label }: { cur: number; prev: number; lowerIsBetter?: boolean; label: string }) {
  if (!prev && !cur) return <span className="text-xs text-muted">no data {label}</span>;
  if (!prev) return <span className="text-xs text-muted">new — nothing {label}</span>;
  const c = (cur - prev) / prev;
  const flat = Math.abs(c) < 0.03;
  const good = flat ? null : c > 0 !== lowerIsBetter;
  const Icon = flat ? Minus : c > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good === null ? "text-muted" : good ? "text-ok" : "text-bad")}>
      <Icon className="size-3.5" aria-hidden />
      {flat ? "same" : format.percent(Math.abs(c))} <span className="font-normal text-muted">vs {label}</span>
    </span>
  );
}

/** A health number: big value, ▲▼ vs before, a coloured edge (green / amber / red). */
export function KpiCard({
  label,
  value,
  sub,
  delta,
  status,
  loading,
  help,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  status?: "good" | "warn" | "bad" | null;
  loading?: boolean;
  help?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card",
        status && "before:absolute before:inset-y-0 before:left-0 before:w-1",
        status === "good" && "before:bg-ok",
        status === "warn" && "before:bg-warn",
        status === "bad" && "before:bg-bad",
      )}
      title={help}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="mt-1 text-2xl leading-tight font-semibold tracking-tight break-words text-text tabular-nums sm:text-[28px]">{value}</p>}
      {!loading && sub ? <p className="mt-0.5 line-clamp-2 text-xs text-text-2">{sub}</p> : null}
      {!loading && delta ? <p className="mt-1.5">{delta}</p> : null}
    </div>
  );
}

/** green ≥ good, red < bad, amber in between (for "higher is better" numbers). */
export const band = (v: number | null | undefined, good: number, bad: number): "good" | "warn" | "bad" | null => (v == null ? null : v >= good ? "good" : v < bad ? "bad" : "warn");
