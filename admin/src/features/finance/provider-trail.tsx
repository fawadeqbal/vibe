"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { JsonBlock, Time } from "@/components/common/bits";
import { ErrorState } from "@/components/common/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/controls";
import type { PaymentEvent } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { usePaymentEvents } from "./api";

/** charge.succeeded → ok, payout.rejected → bad, … (by the step's outcome). */
export function eventTone(type: string): Tone {
  if (/(succeeded|paid|finalized|renewed|approved)$/.test(type)) return "ok";
  if (/(failed|rejected|error)/.test(type)) return "bad";
  if (/(expired|cancel)/.test(type)) return "warn";
  if (type.startsWith("refund")) return "info";
  if (type.startsWith("webhook")) return "primary";
  if (/(pending|started|requested)$/.test(type)) return "info";
  return "neutral";
}

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  bad: "bg-bad",
  warn: "bg-warn",
  info: "bg-info",
  primary: "bg-primary",
  trust: "bg-trust",
  money: "bg-money",
  neutral: "bg-line-strong",
  outline: "bg-line-strong",
};

/**
 * "Provider trail": every step Vibe took with the payment or payout
 * provider (charge started, status checks, webhooks, refund…), oldest first.
 */
export function ProviderTrail({ kind, id, className }: { kind: "purchases" | "cashouts"; id: string; className?: string }) {
  const q = usePaymentEvents(kind, id);
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium text-muted">Provider trail</p>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} className="py-6" />
      ) : q.isLoading ? (
        <Skeleton className="h-24" />
      ) : !q.data?.length ? (
        <p className="text-sm text-muted">No provider steps recorded.</p>
      ) : (
        <ol className="ml-1.5 space-y-3 border-l border-line pl-4">
          {q.data.map((e) => (
            <TrailItem key={e.id} e={e} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TrailItem({ e }: { e: PaymentEvent }) {
  const [open, setOpen] = React.useState(false);
  const tone = eventTone(e.type);
  const hasData = e.data !== null && e.data !== undefined && !(typeof e.data === "object" && Object.keys(e.data as object).length === 0);
  return (
    <li className="relative">
      <span className={cn("absolute top-1.5 -left-[21.5px] size-2.5 rounded-full ring-4 ring-surface", DOT[tone])} aria-hidden />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-medium text-text">{e.type}</span>
        <Badge tone="outline">{e.provider}</Badge>
        {e.code && (
          <Badge tone={tone === "bad" ? "bad" : "neutral"} className="font-mono">
            {e.code}
          </Badge>
        )}
        <Time iso={e.createdAt} mode="dateTime" className="ml-auto text-xs text-muted" />
      </div>
      {e.message && <p className="mt-0.5 text-sm break-words text-text-2">{e.message}</p>}
      {hasData && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-muted hover:text-text" aria-expanded={open}>
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            Details
          </button>
          {open && <JsonBlock value={e.data} className="mt-1.5" />}
        </>
      )}
    </li>
  );
}
