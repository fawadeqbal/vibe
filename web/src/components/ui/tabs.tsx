"use client";

import { cn } from "@/lib/cn";

/** Underlined text tabs (Flutter's TabBar): the follow lists, the leaderboard. */
export function Tabs<T extends string>({ tabs, value, onChange, label, className }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 border-b border-line-soft", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn("type-label -mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium", value === t.value ? "border-pink text-text" : "border-transparent text-muted hover:text-text2")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
