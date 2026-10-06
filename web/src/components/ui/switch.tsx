"use client";

import { cn } from "@/lib/cn";

/**
 * Material 3 switch. Toggles in Vibe are almost all safety toggles: teal
 * track, dark knob when on.
 */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("group relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200", checked ? "bg-trust" : "bg-surface3", disabled && "opacity-40")}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-200 ease-out",
          checked ? "left-6 size-6 bg-bg group-active:left-[22px] group-active:size-7" : "left-2 size-4 bg-text2 group-active:left-0.5 group-active:size-7",
        )}
      />
    </button>
  );
}
