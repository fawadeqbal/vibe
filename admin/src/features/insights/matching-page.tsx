"use client";

import { Info } from "lucide-react";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useCan } from "@/features/auth/session";
import { LiveNow } from "@/features/ops/live-page";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { DaysSwitch, hourLabel, KpiCard, type MatchingReport, pct, useInsights } from "./shared";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Can people find someone? Live numbers, how long they wait, who gives up,
 * and the busy and empty hours (when to post on TikTok, when to run Vibe Hour).
 */
export function MatchingPage() {
  const can = useCan();
  const [days, setDays] = React.useState(7);
  const q = useInsights<MatchingReport>("matching", days);
  const r = q.data;
  const s = r?.searches;
  const c = r?.calls;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matching"
        description={
          r ? (
            <>
              Can people find someone to talk to? {days === 1 ? "Today" : `Last ${days} days`} · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "Can people find someone to talk to?"
          )
        }
        actions={<DaysSwitch value={days} onChange={setDays} />}
      />

      {can(P.OpsLive) ? <LiveNow embedded /> : null}

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {r && !r.collectingSince ? (
            <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-text-2">
              <Info className="size-4 text-muted" aria-hidden /> Waits and people giving up are counted from now on: these numbers fill in as people search.
            </p>
          ) : r?.collectingSince ? (
            <p className="text-xs text-muted">Searches counted since {format.date(r.collectingSince)}.</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Wait to get matched"
              help="From pressing Start to the call starting (median; the slowest 10% in brackets)."
              loading={q.isLoading}
              value={s?.p50WaitSec == null ? "—" : `${Math.round(s.p50WaitSec)} s`}
              sub={s && (s.p90WaitSec == null ? `${format.number(s.matched)} matched` : `slowest 10%: ${Math.round(s.p90WaitSec)} s · ${format.number(s.matched)} matched`)}
              status={s?.p50WaitSec == null ? null : s.p50WaitSec <= 10 ? "good" : s.p50WaitSec <= 30 ? "warn" : "bad"}
            />
            <KpiCard
              label="Gave up waiting"
              help="Searches that ended with the person leaving before anyone was found."
              loading={q.isLoading}
              value={pct(s?.gaveUpRate)}
              sub={s && `${format.number(s.gaveUp)} of ${format.number(s.total)} searches`}
              status={s?.gaveUpRate == null ? null : s.gaveUpRate <= 0.1 ? "good" : s.gaveUpRate <= 0.3 ? "warn" : "bad"}
            />
            <KpiCard
              label="Quick skips"
              help="Random calls that ended in under 10 seconds."
              loading={q.isLoading}
              value={pct(c?.quickRate)}
              sub={c && `${format.number(c.quick)} of ${format.number(c.total)} calls · avg call ${format.duration(c.avgSeconds)}`}
              status={c?.quickRate == null ? null : c.quickRate <= 0.3 ? "good" : c.quickRate <= 0.5 ? "warn" : "bad"}
            />
            <KpiCard
              label="Reports per 100 calls"
              loading={q.isLoading}
              value={c?.reportsPer100 == null ? "—" : c.reportsPer100.toFixed(1)}
              sub={c && `${format.number(c.reports)} reports from calls`}
              status={c?.reportsPer100 == null ? null : c.reportsPer100 <= 2 ? "good" : c.reportsPer100 <= 5 ? "warn" : "bad"}
            />
            <KpiCard
              label="Only two in the room"
              help="Times the only other person searching was the one you had just left."
              loading={q.isLoading}
              value={format.number(s?.rematchSoon)}
              sub="the queue was nearly empty"
              status={s == null ? null : s.rematchSoon === 0 ? "good" : s.rematchSoon <= 5 ? "warn" : "bad"}
            />
          </div>

          <Card>
            <CardHeader
              title="When people search"
              description="Each square is an hour of the week (Pakistan time). Darker = more people searching; a red dot = waits over 30 s or many gave up. Post on TikTok and run Vibe Hour just before the dark hours, and fill the red ones."
            />
            <CardBody>{r ? <Heatmap r={r} /> : <div className="h-52 animate-pulse rounded-lg bg-surface-2" />}</CardBody>
          </Card>

          <Card>
            <CardHeader title="By hour of the day" description="Searches per hour, with the average wait. Red bars = waits over 30 s or more than 30% gave up." />
            <CardBody>{r ? <Hours r={r} /> : <div className="h-40 animate-pulse rounded-lg bg-surface-2" />}</CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function Heatmap({ r }: { r: MatchingReport }) {
  const max = Math.max(1, ...r.heatmap.map((x) => x.searches));
  const at = (dow: number, hour: number) => r.heatmap.find((x) => x.dow === dow && x.hour === hour);
  const grid = "grid grid-cols-[30px_repeat(24,minmax(0,1fr))] gap-[2px] sm:grid-cols-[36px_repeat(24,minmax(0,1fr))] sm:gap-[3px]";
  return (
    <div role="img" aria-label="Searches by day of the week and hour">
      <div className="text-[10px] sm:text-[11px]">
        <div className={grid} aria-hidden>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            // Every 6 hours on a phone, every 3 on wider screens.
            <span key={h} className={cn("text-center whitespace-nowrap text-muted", h % 6 !== 0 && "max-sm:invisible")}>
              {h % 3 === 0 ? hourLabel(h) : ""}
            </span>
          ))}
        </div>
        {DAYS.map((d, i) => (
          <div key={d} className={cn(grid, "mt-[2px] sm:mt-[3px]")}>
            <span className="self-center font-medium text-text-2">{d}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const cell = at(i + 1, h);
              const n = cell?.searches ?? 0;
              const slow = !!cell && ((cell.avgWaitSec ?? 0) > 30 || (n >= 3 && cell.gaveUp / n > 0.3));
              const title = cell
                ? `${d} ${hourLabel(h)}: ${n} searches${cell.avgWaitSec != null ? `, wait ${Math.round(cell.avgWaitSec)} s` : ""}${cell.gaveUp ? `, ${cell.gaveUp} gave up` : ""}`
                : `${d} ${hourLabel(h)}: nobody`;
              return (
                <span
                  key={h}
                  title={title}
                  className="relative h-5 rounded-[3px] bg-surface-2 sm:h-6 sm:rounded-[4px]"
                  style={n ? { background: `color-mix(in oklab, var(--chart-1) ${Math.round(15 + (n / max) * 85)}%, var(--surface-2))` } : undefined}
                >
                  {slow ? <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-bad sm:size-1.5" /> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Hours({ r }: { r: MatchingReport }) {
  const max = Math.max(1, ...r.byHour.map((h) => h.searches));
  return (
    <div>
      <div className="flex h-44 items-end gap-0.5 sm:gap-1">
        {r.byHour.map((h) => {
          const slow = (h.avgWaitSec ?? 0) > 30 || (h.gaveUpRate ?? 0) > 0.3;
          const label = `${hourLabel(h.hour)}: ${h.searches} searches${h.avgWaitSec != null ? `, average wait ${Math.round(h.avgWaitSec)} s` : ""}${h.gaveUpRate ? `, ${pct(h.gaveUpRate)} gave up` : ""}`;
          return (
            <div key={h.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={label} aria-label={label}>
              <span className="hidden text-[10px] text-muted tabular-nums sm:block">{h.avgWaitSec != null ? `${Math.round(h.avgWaitSec)}s` : ""}</span>
              <div
                className={cn("w-full rounded-t-[3px]", slow ? "bg-bad/80" : "bg-[var(--chart-1)]")}
                style={{
                  height: `${Math.max(h.searches ? 4 : 1, (h.searches / max) * 100)}%`,
                  opacity: h.searches ? 1 : 0.25,
                }}
              />
              <span className={cn("text-[10px] whitespace-nowrap text-muted", h.hour % 6 !== 0 && "max-sm:invisible")}>{h.hour % 3 === 0 ? hourLabel(h.hour) : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
