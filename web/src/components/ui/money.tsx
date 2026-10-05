"use client";

import { cn } from "@/lib/cn";
import { coins as fmtCoins, thousands } from "@/lib/format";

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
 * Coins balance chip — lives in most headers so the number is always in
 * sight. With `onClick` it shows a "+" bubble (top up).
 */
export function CoinChip({ coins, onClick, glass = false, showPlus = true }: { coins: number; onClick?: () => void; glass?: boolean; showPlus?: boolean }) {
  const plus = !!onClick && showPlus;
  const h = glass ? 36 : 34;
  const content = (
    <>
      <CoinIcon size={glass ? 18 : 16} />
      <span className="type-number ml-1.5 text-gold" style={{ fontSize: glass ? 14 : 13.5 }}>
        {fmtCoins(coins)}
      </span>
      {plus ? (
        <span className="ml-1.5 flex items-center justify-center rounded-full bg-gold/16" style={{ width: glass ? 24 : 22, height: glass ? 24 : 22 }}>
          <Icon name="add" size={glass ? 16 : 15} className="text-gold" />
        </span>
      ) : null}
    </>
  );
  const cls = cn("inline-flex shrink-0 items-center rounded-full pl-2.5", plus ? "pr-1.5" : "pr-3", glass ? "border border-gold/28 bg-glass backdrop-blur-[20px]" : "bg-gold/12");
  if (!onClick)
    return (
      <span className={cls} style={{ height: h }}>
        {content}
      </span>
    );
  return (
    <button type="button" onClick={onClick} aria-label={`${fmtCoins(coins)} coins. Top up`} className={cn(cls, "transition-[filter] hover:brightness-125")} style={{ height: h }}>
      {content}
    </button>
  );
}

/** Gems balance chip. */
export function GemChip({ gems, onClick }: { gems: number; onClick?: () => void }) {
  const cls = "inline-flex h-[34px] shrink-0 items-center rounded-full bg-gem/10 px-2.5";
  const content = (
    <>
      <GemIcon size={16} />
      <span className="type-number ml-[5px] text-[13.5px] text-gem">{fmtCoins(gems)}</span>
    </>
  );
  if (!onClick) return <span className={cls}>{content}</span>;
  return (
    <button type="button" onClick={onClick} aria-label={`${fmtCoins(gems)} gems`} className={cn(cls, "transition-[filter] hover:brightness-125")}>
      {content}
    </button>
  );
}

/** A small coin amount: gold disc + number ("● 20"). */
export function CoinAmount({ amount, size = 12, className, locked = false }: { amount: number; size?: number; className?: string; locked?: boolean }) {
  return (
    <span className={cn("inline-flex items-center", locked ? "text-muted" : "text-gold", className)}>
      {locked ? <Icon name="lock" size={size + 1} className="text-muted" /> : <CoinIcon size={size} plain />}
      <span className="type-number ml-1" style={{ fontSize: size }}>
        {thousands(amount)}
      </span>
    </span>
  );
}
