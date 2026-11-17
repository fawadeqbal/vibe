"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronRight, ChevronUp, Download, Globe, Lightbulb } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { api, saveFile } from "@/lib/api/client";
import type { InsightRow, MarketingInsights } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  beforeWord,
  change,
  enough,
  type Finding,
  findings,
  glance,
  type Measure,
  MEASURES,
  measureOf,
  periodWord,
  rowName,
  rowsOf,
  type Says,
  show,
  signed,
  type Split,
  SPLITS,
  takeaway,
  toCsv,
  TONE_LABEL,
  tzLabel,
  value,
} from "./insights";
import { periodLabel, useDays } from "./shared";

const PERIODS = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function useInsights(days: number) {
  return useQuery({
    queryKey: ["dashboard", "marketing", "insights", days] as const,
    queryFn: ({ signal }) => api.get<MarketingInsights>("admin/dashboard/marketing/insights", { days }, signal),
    refetchInterval: 60_000,
  });
}

/**
 * Admin → Marketing insights: the five numbers that matter, three cards on
 * what to do about them, a playground (any measure × region, channel, device
 * or hour) and the eight world regions with their countries. Phone-first
 * where it counts: 44 px targets, signs beside colours, labels above bars.
 */
export function MarketingInsightsPage() {
  const [days, setDays] = useDays(30);
  const q = useInsights(days);
  const r = q.data;
  const [measure, setMeasure] = React.useState<Measure>("rate");
  const [split, setSplit] = React.useState<Split>("region");
  const playRef = React.useRef<HTMLHeadingElement>(null);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const open = (f: Finding) => {
    setMeasure(f.action.measure);
    setSplit(f.action.split);
    playRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    playRef.current?.focus({ preventScroll: true });
  };
  const exportCsv = () => {
    if (!r) return;
    saveFile(new Blob([toCsv(r)], { type: "text/csv" }), `vibe-marketing-insights-${days === 1 ? "today" : `${days}-days`}-${r.generatedAt.slice(0, 10)}.csv`);
    toast.success(`Exported ${periodLabel(days)}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing insights"
        description={
          <>
            Who comes, from where, and who stays. {periodLabel(days).replace(/^t/, "T")} against {beforeWord(days)}
            {r ? (
              <>
                {" "}
                · updated <Time iso={r.generatedAt} />
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {r ? (
              <Badge tone={r.live ? "ok" : "neutral"} dot>
                {r.live} on the site now
              </Badge>
            ) : null}
            <Button variant="secondary" size="sm" className="min-h-11 text-xs sm:min-h-8" onClick={exportCsv} disabled={!r} title={`Download ${periodLabel(days)} as CSV: every region, country, channel, device and hour`}>
              <Download className="size-3.5" />
              Export
            </Button>
          </>
        }
      >
        <Seg label="Period" value={days} onChange={setDays} options={PERIODS} className="mt-3 w-full sm:w-auto" />
      </PageHeader>

      <section aria-labelledby="glance">
        <h2 id="glance" className="mb-2.5 text-sm font-semibold text-text-2">
          At a glance
        </h2>
        <Glance r={r} />
      </section>

      <section aria-labelledby="matters">
        <h2 id="matters" className="mb-2.5 text-sm font-semibold text-text-2">
          What matters {periodWord(days)}
        </h2>
        <Findings r={r} onOpen={open} />
      </section>

      <section aria-labelledby="explore" className="space-y-4">
        <h2 id="explore" ref={playRef} tabIndex={-1} className="scroll-mt-20 text-sm font-semibold text-text-2 outline-none">
          Explore
        </h2>
        <Playground r={r} measure={measure} split={split} onMeasure={setMeasure} onSplit={setSplit} />
        <Regions r={r} />
      </section>
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────

/** A segmented switch: 44 px tall on a phone, compact on a computer. */
function Seg<T extends string | number>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid auto-cols-fr grid-flow-col rounded-xl border border-line bg-surface-2 p-0.5 sm:inline-grid sm:rounded-lg", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-[10px] px-2 text-[13px] font-medium whitespace-nowrap text-muted transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-7 sm:rounded-md sm:px-3 sm:text-xs",
            o.value === value && "bg-surface text-text shadow-card",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── At a glance ──────────────────────────────────────────────────────────

function Spark({ points }: { points: number[] }) {
  const pts = points.filter((p) => Number.isFinite(p));
  if (pts.length < 2) return <div className="h-6" aria-hidden />;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const line = points
    .map((v, i) => (Number.isFinite(v) ? `${((i / (points.length - 1)) * 100).toFixed(1)},${(22 - ((v - min) / (max - min || 1)) * 18).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  return (
    <svg aria-hidden width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none" className="block">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Glance({ r }: { r?: MarketingInsights }) {
  if (!r)
    return (
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5 lg:gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn("h-32 rounded-xl", i === 4 && "col-span-2 lg:col-span-1")} />
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5 lg:gap-3">
      {glance(r).map((k, i) => {
        const up = (k.change ?? 0) >= 0;
        const better = k.change === null || k.change === 0 ? null : up === k.good;
        return (
          <div key={k.id} className={cn("flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3.5 shadow-card lg:p-4", i === 4 && "col-span-2 lg:col-span-1")}>
            <span className="text-[12.5px] text-text-2 lg:text-muted">{k.label}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-2xl font-bold tracking-tight tabular-nums">{k.value}</span>
              {k.change !== null ? (
                <span className={cn("inline-flex items-center text-[12.5px] font-semibold tabular-nums", better === null ? "text-muted" : better ? "text-ok" : "text-bad")} aria-label={`${up ? "up" : "down"} ${Math.abs(k.change)}${k.unit === "%" ? " percent" : " points"} on ${beforeWord(r.days)}`}>
                  {k.change > 0 ? <ChevronUp className="size-3.5" aria-hidden /> : k.change < 0 ? <ChevronDown className="size-3.5" aria-hidden /> : null}
                  {signed(k.change, k.unit)}
                </span>
              ) : null}
            </span>
            <span className="text-[11.5px] leading-snug text-muted lg:text-xs">{k.sub}</span>
            <div className={cn("mt-1", k.color)}>
              <Spark points={k.spark} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── What matters ─────────────────────────────────────────────────────────

const TONE = {
  idea: { text: "text-money", soft: "md:bg-money-soft", edge: "border-l-money" },
  good: { text: "text-ok", soft: "md:bg-ok-soft", edge: "border-l-ok" },
  bad: { text: "text-bad", soft: "md:bg-bad-soft", edge: "border-l-bad" },
} as const;

function Findings({ r, onOpen }: { r?: MarketingInsights; onOpen: (f: Finding) => void }) {
  if (!r)
    return (
      <div className="grid gap-2.5 md:grid-cols-3 md:gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  const list = findings(r);
  if (!list.length)
    return (
      <Card>
        <EmptyState icon={Lightbulb} title="Nothing stands out yet" description={`With more visits ${periodWord(r.days)}, this is where the biggest opportunity, what's working and where people are lost show up.`} className="py-10" />
      </Card>
    );
  return (
    <div className="grid gap-2.5 md:grid-cols-3 md:gap-3">
      {list.map((f) => (
        <button
          key={f.tone}
          type="button"
          onClick={() => onOpen(f)}
          className={cn(
            "group flex flex-col items-start gap-2 rounded-xl border border-l-[3px] border-line bg-surface p-3.5 text-left shadow-card transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:border-l md:p-4",
            TONE[f.tone].edge,
            "md:border-l-line",
          )}
        >
          <span className={cn("inline-flex items-center gap-1.5 text-[11.5px] font-bold md:h-[22px] md:rounded-full md:px-2", TONE[f.tone].text, TONE[f.tone].soft)}>
            <Lightbulb className="size-3.5" aria-hidden />
            {TONE_LABEL[f.tone]}
          </span>
          <span className="text-[14.5px] leading-snug font-semibold text-text">{f.title}</span>
          <span className="text-[13px] leading-relaxed text-text-2 md:text-[12.5px]">{f.text}</span>
          <span className="mt-auto inline-flex min-h-7 items-center gap-1 pt-1 text-[13px] font-semibold text-primary md:text-[12.5px]">
            {f.action.label}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Playground ───────────────────────────────────────────────────────────

const SHOWN = 12;

function Say({ parts }: { parts: Says }) {
  return (
    <span>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <React.Fragment key={i}>{p}</React.Fragment>
        ) : (
          <b key={i} className="font-semibold">
            {p.b}
          </b>
        ),
      )}
    </span>
  );
}

function Playground({ r, measure, split, onMeasure, onSplit }: { r?: MarketingInsights; measure: Measure; split: Split; onMeasure: (m: Measure) => void; onSplit: (s: Split) => void }) {
  const m = measureOf(measure);
  return (
    <Card>
      <div className="border-b border-line px-3.5 py-3.5 sm:px-4">
        <h3 className="text-[15px] font-bold">Insights playground</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">Pick what to measure and how to split it. Every number is for the period above.</p>
      </div>
      <div className="flex flex-col gap-3 border-b border-line px-3.5 py-3.5 sm:px-4">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span id="measure-label" className="w-16 shrink-0 text-xs font-semibold text-text-2 sm:text-muted">
            Measure
          </span>
          <div role="radiogroup" aria-labelledby="measure-label" className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-0 sm:rounded-lg sm:border sm:border-line sm:bg-surface-2 sm:p-0.5 sm:px-0.5 [&::-webkit-scrollbar]:hidden">
            {MEASURES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === measure}
                onClick={() => onMeasure(x.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-full border border-line-strong px-3.5 text-[13.5px] font-semibold whitespace-nowrap text-text-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-7 sm:rounded-md sm:border-0 sm:px-3 sm:text-xs sm:font-medium sm:text-muted sm:hover:text-text",
                  x.id === measure && "border-primary-solid bg-primary-solid text-primary-fg sm:bg-surface sm:text-text sm:shadow-card",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="w-16 shrink-0 text-xs font-semibold text-text-2 sm:text-muted">Split by</span>
          <Seg
            label="Split by"
            value={split}
            onChange={onSplit}
            options={SPLITS.map((s) => ({
              value: s.id,
              label: (
                <>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </>
              ),
            }))}
            className="w-full sm:w-auto"
          />
        </div>
      </div>
      <div className="p-3.5 sm:p-4">
        {!r ? (
          <Skeleton className="h-72 rounded-lg" />
        ) : r.totals.visits === 0 ? (
          <EmptyState icon={Globe} title="No visits yet" description={`Nobody has visited the site ${periodWord(r.days)}.`} className="py-10" />
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-primary-soft px-3 py-2.5 text-[13px] leading-relaxed text-text sm:mb-4 sm:px-3.5 sm:py-3 sm:text-[13.5px]" aria-live="polite">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <Say parts={takeaway(r, split, measure)} />
            </div>
            {split === "hour" ? <Hours r={r} measure={measure} color={m.color} /> : <Bars key={`${split}-${measure}`} rows={rowsOf(r, split)} split={split} measure={measure} color={m.color} />}
          </>
        )}
      </div>
    </Card>
  );
}

function Bars({ rows, split, measure, color }: { rows: InsightRow[]; split: Split; measure: Measure; color: string }) {
  const [all, setAll] = React.useState(false);
  const m = measureOf(measure);
  const vals = rows.map((row) => ({ row, x: value(row, measure) }));
  vals.sort((a, b) => b.x - a.x || b.row.visitors - a.row.visitors);
  const max = Math.max(...vals.map((v) => v.x), 0) || 1;
  const total = m.rate ? null : vals.reduce((a, v) => a + v.x, 0);
  const shown = all ? vals : vals.slice(0, SHOWN);
  const noun = SPLITS.find((s) => s.id === split)!.label;
  const vsBefore = (row: InsightRow, x: number) => {
    if (m.rate) return null;
    const before = value(row.before, measure);
    const c = change(x, before);
    if (c === null) return x > 0 ? { text: "new", tone: "text-muted" } : null;
    return { text: signed(c), tone: c > 0 ? "text-ok" : c < 0 ? "text-bad" : "text-muted" };
  };
  return (
    <div>
      <div className="mb-1.5 hidden grid-cols-[minmax(0,200px)_1fr_96px_52px_72px] gap-3 border-b border-line pb-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase sm:grid">
        <span>{noun}</span>
        <span />
        <span className="text-right">{m.label}</span>
        <span className="text-right">{m.rate ? "" : "Share"}</span>
        <span className="text-right">{m.rate ? "" : "vs before"}</span>
      </div>
      <ul aria-label={`${m.label} by ${noun.toLowerCase()}`}>
        {shown.map(({ row, x }) => {
          const few = m.rate && !enough(row, measure);
          const d = vsBefore(row, x);
          const share = total ? `${Math.round((x / total) * 100)}%` : null;
          const name = rowName(split, row.key);
          const bar = (
            <span className="block h-2 overflow-hidden rounded-full bg-surface-3 sm:h-2.5" aria-hidden>
              <span className={cn("block h-full rounded-full", color, few && "opacity-50")} style={{ width: `${(x / max) * 100}%` }} />
            </span>
          );
          return (
            <li key={row.key} className="py-2 sm:grid sm:h-9 sm:grid-cols-[minmax(0,200px)_1fr_96px_52px_72px] sm:items-center sm:gap-3 sm:py-0 sm:text-[13px]">
              {/* Phone: label and value above, the bar under. */}
              <div className="flex items-baseline justify-between gap-2.5 text-[13.5px] sm:contents">
                <span className="min-w-0 truncate font-medium sm:font-normal">
                  {name}
                  {few ? <span className="font-normal text-muted"> · few {measure === "met" ? "sign-ups" : "visits"}</span> : null}
                </span>
                <span className="hidden sm:block">{bar}</span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums sm:contents">
                  <span className="text-xs text-muted sm:hidden">{[share, d?.text].filter(Boolean).join(" · ")}</span>
                  <span className="font-bold sm:text-right sm:font-semibold">{show(x, measure)}</span>
                  <span className="hidden text-right text-muted sm:block">{share ?? ""}</span>
                  <span className={cn("hidden text-right sm:block", d?.tone)}>{d?.text ?? ""}</span>
                </span>
              </div>
              <div className="mt-1.5 sm:hidden">{bar}</div>
            </li>
          );
        })}
      </ul>
      {vals.length > SHOWN ? (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 min-h-11 text-[13px] font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-8">
          {all ? "Show fewer" : `Show all ${vals.length}`}
        </button>
      ) : null}
    </div>
  );
}

function Hours({ r, measure, color }: { r: MarketingInsights; measure: Measure; color: string }) {
  const rate = measureOf(measure).rate;
  const vals = r.hours.map((h) => value(h, measure));
  // A rate's peak only counts hours with enough behind them; the rest are faded.
  const ok = r.hours.map((h) => !rate || enough(h, measure));
  const max = Math.max(...vals, 0) || 1;
  const peak = vals.reduce((best, v, i) => (ok[i] && (best < 0 || v > vals[best]) ? i : best), -1);
  const tz = tzLabel(r.tzOffsetMinutes);
  const peakText = peak >= 0 && vals[peak] > 0 ? `peak ${r.hours[peak].key}:00, ${show(vals[peak], measure)}` : rate ? `too few ${measure === "met" ? "sign-ups" : "visits"} per hour for a peak` : "no peak yet";
  const label = `${measureOf(measure).label} by hour of day (${tz}), ${peakText}`;
  return (
    <div>
      <div role="img" aria-label={label} className="flex gap-0.5 pt-1.5 sm:gap-1">
        {r.hours.map((h, i) => (
          <span key={h.key} className="flex flex-1 flex-col items-center gap-1 sm:gap-1.5">
            <span className="flex h-36 w-full items-end sm:h-56">
              <span title={`${h.key}:00 · ${show(vals[i], measure)}${ok[i] ? "" : ` · few ${measure === "met" ? "sign-ups" : "visits"}`}`} className={cn("block w-full rounded-t-[3px] rounded-b-[1px] sm:rounded-t-[5px]", color, i === peak ? "opacity-100" : ok[i] ? "opacity-50" : "opacity-20")} style={{ height: `${(vals[i] / max) * 100}%` }} />
            </span>
            <span className="h-3 text-[10px] text-muted sm:text-[10.5px]">
              <span className="sm:hidden">{i % 6 === 0 ? h.key : ""}</span>
              <span className="hidden sm:inline">{i % 3 === 0 ? h.key : ""}</span>
            </span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {tz} · {peakText}
        {rate && ok.some((x) => !x) ? " · faded hours have few " + (measure === "met" ? "sign-ups" : "visits") : ""}
      </p>
    </div>
  );
}

// ── Regions ──────────────────────────────────────────────────────────────

/** 🇵🇰 from "PK". */
const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌐");

function Regions({ r }: { r?: MarketingInsights }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-3.5 py-3.5 sm:px-4">
        <h3 className="flex items-center gap-2 text-[15px] font-bold">
          <Globe className="size-4 text-text-2" aria-hidden />
          Regions
        </h3>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Countries grouped by world region. <span className="hidden sm:inline">Open one for its countries.</span>
          <span className="sm:hidden">Tap one for its countries.</span>
        </p>
      </div>
      {!r ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : r.regions.length === 0 ? (
        <EmptyState icon={Globe} title="No visits yet" className="py-8" />
      ) : (
        <>
          <div className="hidden grid-cols-[20px_minmax(0,1.3fr)_1fr_88px_88px_88px_72px] gap-2.5 px-4 pb-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase md:grid">
            <span />
            <span>Region</span>
            <span>Share of visitors</span>
            <span className="text-right">Visitors</span>
            <span className="text-right">Sign-ups</span>
            <span className="text-right">Converts</span>
            <span className="text-right">Change</span>
          </div>
          {r.regions.map((g) => (
            <RegionRow key={g.key} g={g} total={r.totals.visitors || 1} />
          ))}
        </>
      )}
    </Card>
  );
}

function RegionRow({ g, total }: { g: MarketingInsights["regions"][number]; total: number }) {
  const c = change(g.visitors, g.before.visitors);
  const tone = c === null || c === 0 ? "text-muted" : c > 0 ? "text-ok" : "text-bad";
  const ch = c === null ? (g.visitors ? "new" : "—") : signed(c);
  const conv = show(value(g, "rate"), "rate");
  const bar = (
    <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3 md:h-2" aria-hidden>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${(g.visitors / total) * 100}%` }} />
    </span>
  );
  return (
    <details className="group border-t border-line">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset md:grid md:min-h-12 md:grid-cols-[20px_minmax(0,1.3fr)_1fr_88px_88px_88px_72px] md:px-4 md:text-[13.5px] [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
        {/* Phone */}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 md:hidden">
          <span className="flex justify-between gap-2 text-sm">
            <span className="truncate font-semibold">{g.key}</span>
            <span className="font-bold tabular-nums">{format.number(g.visitors)}</span>
          </span>
          <span className="flex items-center gap-2">
            {bar}
            <span className="text-xs whitespace-nowrap text-muted tabular-nums">
              {format.number(g.signups)} sign-ups · {conv} · <span className={tone}>{ch}</span>
            </span>
          </span>
        </span>
        {/* Computer */}
        <span className="hidden truncate font-semibold md:block">{g.key}</span>
        <span className="hidden md:flex">{bar}</span>
        <span className="hidden text-right font-semibold tabular-nums md:block">{format.number(g.visitors)}</span>
        <span className="hidden text-right tabular-nums md:block">{format.number(g.signups)}</span>
        <span className="hidden text-right tabular-nums md:block">{conv}</span>
        <span className={cn("hidden text-right tabular-nums md:block", tone)}>{ch}</span>
      </summary>
      <ul className="pb-1.5" aria-label={`Countries in ${g.key}`}>
        {g.countries.map((x) => {
          const cc = change(x.visitors, x.before.visitors);
          return (
            <li key={x.key} className="flex justify-between gap-3 py-2 pr-3.5 pl-10 text-[13px] text-text-2 md:grid md:grid-cols-[20px_minmax(0,1.3fr)_1fr_88px_88px_88px_72px] md:gap-2.5 md:px-4 md:py-1.5">
              <span className="hidden md:block" />
              <span className="truncate">
                <span aria-hidden>{flag(x.key)} </span>
                {rowName("country", x.key)}
              </span>
              <span className="hidden md:block" />
              <span className="shrink-0 tabular-nums md:hidden">
                {format.number(x.visitors)} · {show(value(x, "rate"), "rate")}
              </span>
              <span className="hidden text-right tabular-nums md:block">{format.number(x.visitors)}</span>
              <span className="hidden text-right tabular-nums md:block">{format.number(x.signups)}</span>
              <span className="hidden text-right tabular-nums md:block">{show(value(x, "rate"), "rate")}</span>
              <span className={cn("hidden text-right tabular-nums md:block", cc === null || cc === 0 ? "text-muted" : cc > 0 ? "text-ok" : "text-bad")}>{cc === null ? (x.visitors ? "new" : "—") : signed(cc)}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
