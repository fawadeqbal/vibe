"use client";

import { Check, Minus } from "lucide-react";
import { Avatar as A, Checkbox as C, Switch as S, Tabs as T, Tooltip as TT } from "radix-ui";
import * as React from "react";

import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── switch ────────────────────────────────────────────────────────────────

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-surface-3 transition-colors data-[state=checked]:bg-primary-solid disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </S.Root>
  );
}

// ── checkbox ──────────────────────────────────────────────────────────────

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border border-line-strong bg-surface data-[state=checked]:border-primary-solid data-[state=checked]:bg-primary-solid data-[state=indeterminate]:border-primary-solid data-[state=indeterminate]:bg-primary-solid disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <C.Indicator className="text-primary-fg">{props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
    </C.Root>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex items-center gap-1 overflow-x-auto border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ className, count, children, ...props }: React.ComponentProps<typeof T.Trigger> & { count?: number }) {
  return (
    <T.Trigger
      className={cn(
        "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-text data-[state=active]:border-primary data-[state=active]:text-text",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="rounded bg-surface-3 px-1.5 text-xs tabular text-text-2">{format.compact(count)}</span>}
    </T.Trigger>
  );
}

// ── tooltip ───────────────────────────────────────────────────────────────

export const TooltipProvider = TT.Provider;

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <TT.Root>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-text px-2 py-1 text-xs text-bg shadow-pop data-[state=delayed-open]:animate-in">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ── avatar ────────────────────────────────────────────────────────────────

export function Avatar({ src, name, size = 32, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  return (
    <A.Root className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-3", className)} style={{ width: size, height: size }}>
      {src ? <A.Image src={src} alt="" className="size-full object-cover" /> : null}
      <A.Fallback className="flex size-full items-center justify-center bg-primary-soft font-medium text-primary" style={{ fontSize: Math.max(10, size * 0.38) }} delayMs={src ? 300 : 0}>
        {format.initials(name)}
      </A.Fallback>
    </A.Root>
  );
}

// ── skeleton & misc ───────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} aria-hidden />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 items-center rounded border border-line bg-surface-2 px-1.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

/** Pill buttons for a small set of options (e.g. 7d / 30d / 90d). */
export function Segmented<T extends string | number>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("h-7 rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:text-text", o.value === value && "bg-surface text-text shadow-card")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
