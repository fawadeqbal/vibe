import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Skeleton } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-surface-2 text-text-2",
  primary: "bg-primary-soft text-primary",
  trust: "bg-trust-soft text-trust",
  money: "bg-money-soft text-money",
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
} as const;

/** One KPI: label, big number, a line of context. Clickable when `href` is set. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
  loading,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  href?: string;
  loading?: boolean;
  /** Draw attention (e.g. a queue that needs someone). */
  emphasis?: boolean;
}) {
  const body = (
    <div className={cn("h-full rounded-xl border border-line bg-surface p-4 shadow-card transition-colors", href && "hover:border-line-strong", emphasis && "border-warn/40")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon && (
          <span className={cn("flex size-7 items-center justify-center rounded-lg", TONES[tone])}>
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1.5 text-2xl font-semibold tracking-tight text-text tabular">{value}</p>}
      {hint && !loading && <p className="mt-1 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
