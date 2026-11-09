"use client";

import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";
import { AMOUNT_SLOT, compact, thousands } from "@/lib/format";

import { Icon } from "./icon";

/** The gold coin: a gradient disc with "¢" (just the disc when tiny or `plain`). */
export function CoinIcon({ size = 18, plain = false, className }: { size?: number; plain?: boolean; className?: string }) {
  return (
    <span className={cn("bg-gold-grad inline-flex shrink-0 items-center justify-center rounded-full", className)} style={{ width: size, height: size }} aria-hidden>
      {plain || size < 14 ? null : (
        <span className="font-extrabold leading-none text-[#6B4200]" style={{ fontSize: size * 0.6 }}>
          ¢
        </span>
      )}
    </span>
  );
}

/** Gems (teal — gems are what you cash out). */
export function GemIcon({ size = 18, className }: { size?: number; className?: string }) {
  return <Icon name="diamond" size={size} className={cn("text-gem", className)} />;
}

/**
 * A short amount in a fixed 5-character slot (tabular figures), so 30, 9,999,
 * 12.4K and 1.25M all take the same room and nothing beside it moves.
 */
export function AmountSlot({ n, className, style }: { n: number; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn("type-number inline-block shrink-0 overflow-hidden text-center whitespace-nowrap", className)} style={{ width: AMOUNT_SLOT, ...style }}>
      {compact(n)}
    </span>
  );
}

/**
 * Coins balance chip — lives in most headers so the number is always in
 * sight. With `onClick` it shows a "+" bubble (top up). Always the same width:
 * the number sits in a 5-character slot and goes short past 9,999.
 */
export function CoinChip({ coins, onClick, glass = false, showPlus = true }: { coins: number; onClick?: () => void; glass?: boolean; showPlus?: boolean }) {
  const plus = !!onClick && showPlus;
  const h = glass ? 36 : 34;
  const content = (
    <>
      <CoinIcon size={glass ? 18 : 16} />
      <AmountSlot n={coins} className="ml-1 text-gold" style={{ fontSize: glass ? 14 : 13.5 }} />
      {plus ? (
        <span className="ml-1.5 flex items-center justify-center rounded-full bg-gold/16" style={{ width: glass ? 24 : 22, height: glass ? 24 : 22 }}>
          <Icon name="add" size={glass ? 16 : 15} className="text-gold" />
        </span>
      ) : null}
    </>
  );
  const cls = cn("inline-flex shrink-0 items-center rounded-full pl-2.5", plus ? "pr-1.5" : "pr-2", glass ? "border border-gold/28 bg-glass backdrop-blur-[20px]" : "bg-gold/12");
  const label = `${thousands(coins)} coins`;
  if (!onClick)
    return (
      <span role="img" aria-label={label} className={cls} style={{ height: h }}>
        {content}
      </span>
    );
  return (
    <button type="button" onClick={onClick} aria-label={plus ? `${label}. Top up` : label} className={cn(cls, "transition-[filter] hover:brightness-125")} style={{ height: h }}>
      {content}
    </button>
  );
}

/** Gems balance chip. */
export function GemChip({ gems, onClick }: { gems: number; onClick?: () => void }) {
  const cls = "inline-flex h-[34px] shrink-0 items-center rounded-full bg-gem/10 pr-2 pl-2.5";
  const content = (
    <>
      <GemIcon size={16} />
      <AmountSlot n={gems} className="ml-1 text-[13.5px] text-gem" />
    </>
  );
  if (!onClick)
    return (
      <span role="img" aria-label={`${thousands(gems)} gems`} className={cls}>
        {content}
      </span>
    );
  return (
    <button type="button" onClick={onClick} aria-label={`${thousands(gems)} gems`} className={cn(cls, "transition-[filter] hover:brightness-125")}>
      {content}
    </button>
  );
}

/** A small coin amount: gold disc + number ("● 20", "● 12.4K"). */
export function CoinAmount({ amount, size = 12, className, locked = false }: { amount: number; size?: number; className?: string; locked?: boolean }) {
  return (
    <span className={cn("inline-flex items-center", locked ? "text-muted" : "text-gold", className)} title={amount >= 10_000 ? `${thousands(amount)} coins` : undefined}>
      {locked ? <Icon name="lock" size={size + 1} className="text-muted" /> : <CoinIcon size={size} plain />}
      <span className="type-number ml-1" style={{ fontSize: size }}>
        {compact(amount)}
      </span>
    </span>
  );
}
