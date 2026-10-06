"use client";

import { cn } from "@/lib/cn";

/**
 * iOS switch: a 52×32 capsule with a white knob that stretches while pressed.
 * Toggles in Vibe are almost all safety toggles, so "on" is teal.
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
      className={cn(
        "group relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-300 ease-(--ease-spring)",
        checked ? "bg-trust" : "bg-white/16 shadow-[inset_0_0_0_1px_rgb(255_255_255/.06)]",
        disabled && "opacity-40",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-7 rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/.3),0_1px_1px_rgb(0_0_0/.16)] transition-all duration-300 ease-(--ease-spring)",
          checked ? "left-[22px] w-7 group-active:left-[16px] group-active:w-[34px]" : "left-[2px] w-7 group-active:w-[34px]",
        )}
      />
    </button>
  );
}
