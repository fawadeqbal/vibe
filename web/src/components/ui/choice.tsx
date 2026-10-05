"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Icon } from "./icon";

/**
 * A selectable tile (gender, payout method, filter segment): surface2 with a
 * soft hairline; selected = highlighted fill with a 1.5px border.
 */
export function ChoiceTile({
  selected,
  onClick,
  children,
  tone = "pink",
  className,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "pink" | "gem";
  /** Height and radius, e.g. "h-[46px] rounded-[16px]". */
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center border transition-colors duration-150",
        selected ? (tone === "gem" ? "border-[1.5px] border-gem bg-gem/12" : "border-[1.5px] border-pink bg-surface-sel") : "border-line-soft bg-surface2 hover:bg-surface3/70",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** An interest chip: pink with a check when picked. */
export function InterestChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-[18px] border px-3.5 transition-colors duration-150",
        selected ? "border-pink/60 bg-pink/14 text-pink-soft" : "border-line-soft bg-surface2 text-text2 hover:bg-surface3/70",
      )}
    >
      {selected ? <Icon name="check" size={14} className="mr-1 text-pink-soft" /> : null}
      <span className="type-label text-[13px]">{label}</span>
    </button>
  );
}
