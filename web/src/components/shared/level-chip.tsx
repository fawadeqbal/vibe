import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { BADGES } from "@/lib/engagement";

/** "Lv 7" next to a name (profiles, the call partner, leaderboards). `glass` over video. */
export function LevelChip({ level, glass = false, className }: { level: number; glass?: boolean; className?: string }) {
  return (
    <span
      className={cn("type-label inline-flex h-[18px] shrink-0 items-center rounded-[9px] px-1.5 text-[10.5px] font-bold text-lavender", glass && "border border-violet/40", className)}
      style={{ backgroundColor: alpha("violet", glass ? 0.32 : 0.18) }}
      aria-label={`Level ${level}`}
      title={`Level ${level}`}
    >
      Lv {level}
    </span>
  );
}

/** Earned badges as a row of emoji tiles (profiles, the Progress card). */
export function BadgeRow({ ids, max = 10, size = 34 }: { ids: string[]; max?: number; size?: number }) {
  const known = ids.filter((id) => BADGES[id]);
  if (!known.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {known.slice(0, max).map((id) => (
        <span
          key={id}
          title={BADGES[id].name}
          aria-label={BADGES[id].name}
          role="img"
          className="flex shrink-0 items-center justify-center rounded-[12px] border border-line bg-surface2"
          style={{ width: size, height: size, fontSize: size * 0.5 }}
        >
          {BADGES[id].emoji}
        </span>
      ))}
      {known.length > max ? <span className="type-label flex h-[34px] items-center px-1 text-[12px] text-muted">+{known.length - max}</span> : null}
    </div>
  );
}

/** Your level in a ring that fills toward the next one (`fraction` 0…1). */
export function LevelRing({ level, fraction, size = 68 }: { level: number; fraction: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Level ${level}, ${Math.round(fraction * 100)}% to the next`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-violet)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * Math.min(1, Math.max(0, fraction))} ${c}`} className="transition-[stroke-dasharray] duration-500" />
      </svg>
      <span className="flex flex-col items-center">
        <span className="type-overline text-[8.5px] tracking-[1px] text-lavender">Level</span>
        <span className="type-number-lg text-[22px] leading-none">{level}</span>
      </span>
    </span>
  );
}
