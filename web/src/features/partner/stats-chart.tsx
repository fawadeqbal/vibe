"use client";

import { useRef, useState } from "react";

import { useElementSize } from "@/hooks/use-element-size";
import { type ChartMetric, chartBars, countShort, dayLabel, niceMax, type StatsDay, usdCents, usdCentsShort } from "@/lib/affiliate";
import { thousands } from "@/lib/format";

const H = 168;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const AXIS_W = 40;

/**
 * One measure at a time as columns (one axis, no legend: the chips above
 * name it). Money is gold, counts violet. Columns ≤ 24px with a 4px rounded
 * cap, hairline grid, a hover/focus tooltip per column and a table for
 * screen readers. 90 days are drawn as weekly columns.
 */
export function StatsChart({ daily, metric, days, label }: { daily: StatsDay[]; metric: ChartMetric; days: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(box);
  const [hover, setHover] = useState<number | null>(null);
  const bars = chartBars(daily, metric, days);
  const money = metric === "earnedUsdCents";
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)), money ? 100 : 4);
  const fmt = (v: number) => (money ? usdCents(v) : thousands(v));
  const tick = (v: number) => (money ? usdCentsShort(v) : countShort(v));
  // Gridlines at 0, half and top; counts skip a half that isn't a whole number.
  const ticks = [0, max / 2, max].filter((t) => money || Number.isInteger(t));
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const slot = bars.length ? plotW / bars.length : 0;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const fill = money ? "var(--color-gold)" : "var(--color-violet)";
  const weekly = days > 30;
  const when = (i: number) => (bars[i].from === bars[i].to ? dayLabel(bars[i].to) : `${dayLabel(bars[i].from)} – ${dayLabel(bars[i].to)}`);
  // A few x labels: first, middle, last.
  const xLabels = bars.length ? [...new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1])] : [];

  return (
    <div ref={box} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={H} role="img" aria-label={`${label}, ${weekly ? "weekly" : "daily"} for the last ${days} days`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={AXIS_W - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-muted text-[10.5px] tabular-nums">
                {tick(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = AXIS_W + slot * i + slot / 2;
            const top = y(b.value);
            const h = PAD_TOP + plotH - top;
            const r = Math.min(4, barW / 2, h);
            const x = cx - barW / 2;
            const base = PAD_TOP + plotH;
            return (
              <g key={b.to}>
                {b.value > 0 ? (
                  <path
                    d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`}
                    fill={fill}
                    opacity={hover == null || hover === i ? 1 : 0.45}
                  />
                ) : null}
                <rect
                  x={AXIS_W + slot * i}
                  y={PAD_TOP}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${when(i)}: ${fmt(b.value)}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => setHover(i)}
                  className="outline-none"
                />
              </g>
            );
          })}
          {xLabels.map((i) => (
            <text key={i} x={AXIS_W + slot * i + slot / 2} y={H - 6} textAnchor={i === 0 && bars.length > 1 ? "start" : i === bars.length - 1 && bars.length > 1 ? "end" : "middle"} className="fill-muted text-[10.5px]">
              {dayLabel(bars[i].to)}
            </text>
          ))}
        </svg>
      ) : (
        <div style={{ height: H }} />
      )}
      {hover != null && bars[hover] ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[10px] border border-line bg-surface3 px-2.5 py-1.5 shadow-[0_6px_20px_rgb(0_0_0/.4)]"
          style={{ left: Math.min(Math.max(AXIS_W + slot * hover + slot / 2, 60), width - 60) }}
        >
          <p className="type-body text-[11px] whitespace-nowrap text-text2">{when(hover)}</p>
          <p className="type-number text-[13px] whitespace-nowrap text-text">{fmt(bars[hover].value)}</p>
        </div>
      ) : null}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {bars.map((b, i) => (
            <tr key={b.to}>
              <th scope="row">{when(i)}</th>
              <td>{fmt(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
