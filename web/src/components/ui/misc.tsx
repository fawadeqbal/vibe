import type { ReactNode } from "react";

import { alpha, color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";

import { Icon } from "./icon";
import { Headline } from "./typography";

/** A small tinted label: "Best value", "+10% bonus", "Default". */
export function Tag({ text, tone = "pink", icon, textTone }: { text: string; tone?: Tone; icon?: string; textTone?: Tone }) {
  const fg = textTone ?? (tone === "pink" ? "pink-soft" : tone);
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center rounded-[11px] px-2" style={{ backgroundColor: alpha(tone, 0.14) }}>
      {icon ? <Icon name={icon} size={12} className="mr-1" style={{ color: color(fg) }} /> : null}
      <span className="type-label whitespace-nowrap text-[10.5px] font-bold" style={{ color: color(fg) }}>
        {text}
      </span>
    </span>
  );
}

/** Little green "online" dot with a soft halo. */
export function OnlineDot({ size = 8, tone = "ok" }: { size?: number; tone?: Tone }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color(tone), boxShadow: `0 0 0 ${size / 2}px ${alpha(tone, 0.18)}` }} />;
}

export function EmptyState({ icon, iconVariant, title, accent, body, action, className }: { icon: string; iconVariant?: "round" | "outlined"; title: string; accent?: string; body: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      <span className="flex size-[72px] items-center justify-center rounded-[24px] border border-line bg-surface">
        <Icon name={icon} variant={iconVariant} size={32} className="text-text2" />
      </span>
      <Headline as="h2" text={title} accent={accent} size={22} align="center" className="mt-[18px]" />
      <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">{body}</p>
      {action ? <div className="mt-[22px]">{action}</div> : null}
    </div>
  );
}

/** Radio dot (report reasons, VIP plans): filled with a dark centre when on. */
export function RadioDot({ on, tone = "pink" }: { on: boolean; tone?: Tone }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-150"
      style={on ? { backgroundColor: color(tone) } : { border: "2px solid var(--color-muted)" }}
      aria-hidden
    >
      {on ? <span className="size-2 rounded-full bg-bg" /> : null}
    </span>
  );
}

/** Material's linear progress bar (gems towards the cash-out minimum). */
export function ProgressBar({ value, tone = "gem" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-[4px] bg-surface3" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full transition-[width] duration-300" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, backgroundColor: color(tone) }} />
    </div>
  );
}

/** A vertical hairline between stats. */
export const VDivider = ({ className }: { className?: string }) => <span className={cn("w-px self-stretch bg-line", className)} />;
