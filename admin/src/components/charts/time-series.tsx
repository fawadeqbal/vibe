"use client";

import { format as fmtDate } from "date-fns";
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/controls";

export interface Series<T> {
  key: keyof T & string;
  label: string;
  /** A chart token (1–5). Order is fixed per entity, never by rank. */
  color: 1 | 2 | 3 | 4 | 5;
}

const color = (n: number) => `var(--chart-${n})`;
const day = (d: string) => fmtDate(new Date(`${d}T00:00:00`), "d MMM");

/**
 * Daily series on one y-axis. Bars for amounts per day (revenue), area for
 * counts over time. 2 px lines, rounded bar tops, recessive grid, a hover
 * tooltip, and a legend when there is more than one series.
 */
export function TimeSeriesChart<T extends { day: string }>({
  data,
  series,
  kind = "area",
  valueFormat = (n) => n.toLocaleString("en-US"),
  tickFormat,
  height = 220,
  loading,
}: {
  data: T[] | undefined;
  series: Series<T>[];
  kind?: "area" | "bar";
  valueFormat?: (n: number) => string;
  /** Short axis labels (defaults to valueFormat). */
  tickFormat?: (n: number) => string;
  height?: number;
  loading?: boolean;
}) {
  const id = React.useId().replace(/:/g, "");
  if (loading || !data)
    return (
      <div style={{ height }}>
        <Skeleton className="size-full" />
      </div>
    );

  const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false };
  const tooltip = (
    <Tooltip
      cursor={kind === "bar" ? { fill: "var(--surface-2)" } : { stroke: "var(--line-strong)", strokeWidth: 1 }}
      content={({ active, payload, label }) =>
        active && payload?.length ? (
          <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
            <p className="mb-1 font-medium text-text">{day(String(label))}</p>
            {payload.map((p) => (
              <p key={String(p.dataKey)} className="flex items-center gap-2 text-text-2">
                <span className="size-2 rounded-full" style={{ background: p.color }} />
                {series.find((s) => s.key === p.dataKey)?.label}
                <span className="ml-auto pl-3 font-medium text-text tabular">{valueFormat(Number(p.value))}</span>
              </p>
            ))}
          </div>
        ) : null
      }
    />
  );

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-text-2">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: color(s.color) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ height }} role="img" aria-label={`${series.map((s) => s.label).join(" and ")} per day`}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
              <XAxis dataKey="day" tickFormatter={day} {...axis} minTickGap={24} />
              <YAxis {...axis} axisLine={false} width={48} tickFormatter={(v) => (tickFormat ?? valueFormat)(Number(v))} allowDecimals={false} />
              {tooltip}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key as string} fill={color(s.color)} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color(s.color)} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={color(s.color)} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="day" tickFormatter={day} {...axis} minTickGap={24} />
              <YAxis {...axis} axisLine={false} width={48} tickFormatter={(v) => (tickFormat ?? valueFormat)(Number(v))} allowDecimals={false} />
              {tooltip}
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key as string}
                  stroke={color(s.color)}
                  strokeWidth={2}
                  fill={`url(#${id}-${s.key})`}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal share bars (revenue by method etc.): label, bar, value. */
export function ShareBars({ items, valueFormat }: { items: { label: string; value: number; sub?: string }[]; valueFormat: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">No data yet</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-text">{i.label}</span>
            <span className="text-text tabular">
              {valueFormat(i.value)}
              {i.sub && <span className="ml-1.5 text-xs text-muted">{i.sub}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
