"use client";

import { BadgeCheck, Bot, Check, Copy, Crown, Gem } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Avatar, Tooltip } from "@/components/ui/controls";
import { flag, format } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Avatar + name (+ verified/VIP/bot marks), linking to the user. */
export function UserCell({
  user,
  sub,
  size = 32,
  link = true,
  className,
}: {
  user: { id: string; name: string; avatarUrl?: string; verified?: boolean; isBot?: boolean; countryCode?: string; vipUntil?: string | null; online?: boolean } | null;
  sub?: React.ReactNode;
  size?: number;
  link?: boolean;
  className?: string;
}) {
  if (!user) return <span className="text-sm text-muted">Unknown</span>;
  const inner = (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span className="relative">
        <Avatar src={user.avatarUrl} name={user.name || "?"} size={size} />
        {user.online && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-ok" title="Online" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium text-text">
          <span className="truncate">{user.name || "No name"}</span>
          {user.verified && <BadgeCheck className="size-3.5 shrink-0 text-trust" aria-label="Verified" />}
          {user.vipUntil && <Crown className="size-3.5 shrink-0 text-money" aria-label="VIP" />}
          {user.isBot && <Bot className="size-3.5 shrink-0 text-muted" aria-label="Dev bot" />}
          {user.countryCode && <span className="text-xs" aria-hidden>{flag(user.countryCode)}</span>}
        </span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </span>
  );
  return link ? (
    <Link href={`/users/${user.id}`} className="min-w-0 rounded-md hover:[&_span.text-sm]:text-primary" onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** Relative time with the exact time on hover. */
export function Time({ iso, mode = "ago", className }: { iso: string | null | undefined; mode?: "ago" | "date" | "dateTime"; className?: string }) {
  if (!iso) return <span className={cn("text-muted", className)}>—</span>;
  const text = mode === "ago" ? format.relative(iso) : mode === "date" ? format.date(iso) : format.dateTime(iso);
  return (
    <Tooltip content={format.dateTime(iso)}>
      <time dateTime={iso} className={cn("whitespace-nowrap", className)}>
        {text}
      </time>
    </Tooltip>
  );
}

export function Coins({ value, signed, className }: { value: number; signed?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular", signed && value < 0 && "text-bad", signed && value > 0 && "text-ok", className)}>
      <span className="size-2.5 rounded-full bg-money" aria-hidden />
      {signed ? format.signed(value) : format.number(value)}
      <span className="sr-only"> coins</span>
    </span>
  );
}

export function Gems({ value, signed, className }: { value: number; signed?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular", signed && value < 0 && "text-bad", signed && value > 0 && "text-ok", className)}>
      <Gem className="size-3 text-trust" aria-hidden />
      {signed ? format.signed(value) : format.number(value)}
      <span className="sr-only"> gems</span>
    </span>
  );
}

/** Monospace id that copies on click. */
export function IdChip({ id, label, className }: { id: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(id);
        setDone(true);
        toast.success(`${label ?? "ID"} copied`);
        setTimeout(() => setDone(false), 1200);
      }}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-2 hover:bg-surface-3", className)}
      title="Copy"
    >
      <span className="truncate">{id}</span>
      {done ? <Check className="size-3 text-ok" /> : <Copy className="size-3 text-muted" />}
    </button>
  );
}

export function YesNo({ value, yes = "Yes", no = "No" }: { value: boolean; yes?: string; no?: string }) {
  return value ? <Badge tone="ok">{yes}</Badge> : <Badge>{no}</Badge>;
}
