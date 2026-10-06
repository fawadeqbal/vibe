"use client";

import { Icon } from "@/components/ui/icon";
import { alpha, color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { streakTone } from "@/lib/engagement";
import type { StreakView } from "@/lib/models";

const LOOK: Record<"pending" | "today" | "atRisk", { fg: Tone; bg: number }> = {
  /** Not counted yet today: quiet. */
  pending: { fg: "muted", bg: 0.1 },
  today: { fg: "flame", bg: 0.14 },
  atRisk: { fg: "warn", bg: 0.16 },
};

/**
 * 🔥 12 after a friend's name: grey until today counts, orange once it does,
 * amber and breathing when it ends tonight ("ends tonight" with `riskLabel`).
 * Nothing when there is no streak.
 */
export function StreakChip({ streak, riskLabel = false, onClick, className }: { streak: StreakView; riskLabel?: boolean; onClick?: () => void; className?: string }) {
  const tone = streakTone(streak);
  if (tone === "none") return null;
  const look = LOOK[tone];
  const label = `${streak.count}-day streak${tone === "atRisk" ? ", ends tonight" : tone === "pending" ? ", not counted today yet" : ""}`;
  const body = (
    <>
      <Icon name="local_fire_department" size={14} style={{ color: color(look.fg), animation: tone === "atRisk" ? "vibe-flame-pulse 1.6s ease-in-out infinite" : undefined }} />
      <span className="type-number ml-0.5 text-[12px]" style={{ color: color(tone === "pending" ? "text2" : look.fg) }}>
        {streak.count}
      </span>
      {tone === "atRisk" && riskLabel ? <span className="type-label ml-1 text-[11px] whitespace-nowrap" style={{ color: color("warn") }}>ends tonight</span> : null}
    </>
  );
  const cls = cn("inline-flex h-[22px] shrink-0 items-center rounded-[11px] pr-2 pl-1.5", className);
  const style = { backgroundColor: alpha(look.fg, look.bg) };
  if (!onClick)
    return (
      <span className={cls} style={style} role="img" aria-label={label} title={label}>
        {body}
      </span>
    );
  return (
    <button type="button" onClick={onClick} className={cn(cls, "transition-[filter] hover:brightness-125")} style={style} aria-label={label} title={label}>
      {body}
    </button>
  );
}
