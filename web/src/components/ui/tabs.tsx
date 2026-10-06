"use client";

import { cn } from "@/lib/cn";

/** iOS segmented control on glass: the follow lists, the leaderboard. A glass lens glides to the selected segment. */
export function Tabs<T extends string>({ tabs, value, onChange, label, className }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string; className?: string }) {
  const index = tabs.findIndex((t) => t.value === value);
  const n = tabs.length;
  return (
    <div role="tablist" aria-label={label} className={cn("glass relative flex h-10 rounded-full p-[3px]", className)}>
      {index >= 0 ? (
        <span
          aria-hidden
          className="glass-lens absolute top-[3px] bottom-[3px] rounded-full transition-[left] duration-500 ease-(--ease-spring)"
          style={{ width: `calc((100% - 6px) / ${n})`, left: `calc(3px + (100% - 6px) * ${index} / ${n})` }}
        />
      ) : null}
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn("type-label relative z-[2] flex-1 truncate rounded-full px-3 text-[13.5px] transition-colors", value === t.value ? "font-semibold text-text" : "font-medium text-text2 hover:text-text")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
