"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Webhook } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { IdChip, JsonBlock, Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, ErrorState, PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar, FilterSelect, ResetFilters } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { WebhookEvent, WebhookEventDetail } from "@/lib/api/types";
import { format } from "@/lib/format";

import { integrationKeys, useWebhook, useWebhooks, WEBHOOK_PROVIDERS, WEBHOOK_STATUSES } from "./api";

const DEFAULTS = { provider: "", status: "", open: "" };

/** Link to what the webhook was about, when the panel has a page for it. */
function subjectHref(e: Pick<WebhookEvent, "subjectType" | "subjectId">): string | null {
  if (!e.subjectId) return null;
  switch (e.subjectType) {
    case "purchase":
      return `/finance/purchases?open=${e.subjectId}`;
    case "cashout":
      return `/finance/cashouts?status=ALL&q=${e.subjectId}&open=${e.subjectId}`;
    case "user":
      return `/users/${e.subjectId}`;
    default:
      return null;
  }
}

const columns: Column<WebhookEvent>[] = [
  { id: "provider", header: "Provider", cell: (e) => <Badge tone="outline">{e.provider}</Badge> },
  { id: "type", header: "Event", cell: (e) => <span className="font-mono text-xs text-text">{e.eventType ?? "—"}</span>, className: "min-w-32" },
  { id: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
  {
    id: "error",
    header: "Error / note",
    cell: (e) => (e.error ? <span className={e.status === "FAILED" ? "text-xs text-bad" : "text-xs text-muted"}>{e.error}</span> : <span className="text-muted">—</span>),
    className: "hidden md:table-cell max-w-72 truncate",
  },
  { id: "attempts", header: "Tries", cell: (e) => <span className="tabular text-text-2">{e.attempts}</span>, align: "right", className: "hidden sm:table-cell" },
  { id: "subject", header: "About", cell: (e) => (e.subjectType ? <span className="text-xs text-text-2">{format.enum(e.subjectType)}</span> : <span className="text-muted">—</span>), className: "hidden lg:table-cell" },
  { id: "at", header: "Received", cell: (e) => <Time iso={e.receivedAt} className="text-text-2" /> },
];

/** Every provider callback, as received: filter, inspect the payload, retry a failed one. */
export function WebhooksPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const list = useWebhooks({ provider: f.provider, status: f.status });
  const filtered = !!(f.provider || f.status);
  return (
    <div>
      <PageHeader
        back={{ href: "/integrations", label: "Integrations" }}
        title="Webhooks"
        description="Callbacks from payment providers, stored before they're acted on. Failed ones are retried automatically a few times; open one to see the payload or retry it."
      />
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(e) => e.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(e) => setF({ open: e.id })}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        rowClassName={(e) => (e.status === "FAILED" ? "bg-bad-soft/30" : undefined)}
        empty={{ icon: Webhook, title: filtered ? "No webhooks match" : "No webhooks yet" }}
        toolbar={
          <FilterBar>
            <FilterSelect label="Provider" value={f.provider} onChange={(provider) => setF({ provider })} options={[...new Set([...WEBHOOK_PROVIDERS, ...(f.provider ? [f.provider] : [])])].map((p) => ({ value: p, label: p }))} />
            <FilterSelect label="Status" value={f.status} onChange={(status) => setF({ status })} options={WEBHOOK_STATUSES.map((s) => ({ value: s, label: format.enum(s) }))} />
            <ResetFilters show={filtered} onReset={reset} />
          </FilterBar>
        }
      />
      <WebhookSheet id={f.open || null} onClose={() => setF({ open: "" })} />
    </div>
  );
}

function WebhookSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useWebhook(id);
  const e = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
        <SheetContent title={e ? `${e.provider} · ${e.eventType ?? "event"}` : "Webhook"} description={e ? `Received ${format.dateTime(e.receivedAt)}` : undefined} footer={e && <RetryButton e={e} />}>
          {q.error ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : !e ? (
            <Skeleton className="h-60" />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <Badge tone="outline">{e.provider}</Badge>
                <StatusBadge status={e.status} />
              </div>
              {e.error && <p className={e.status === "FAILED" ? "rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" : "rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-2"}>{e.error}</p>}
              <DescriptionList
                items={[
                  { label: "Webhook id", value: <IdChip id={e.id} /> },
                  { label: "Provider's event id", value: <IdChip id={e.eventId} label="Event id" /> },
                  { label: "Tries", value: format.number(e.attempts) },
                  { label: "Processed", value: format.dateTime(e.processedAt) },
                  {
                    label: "About",
                    value: e.subjectType ? (
                      subjectHref(e) ? (
                        <Link href={subjectHref(e)!} className="text-primary hover:underline">
                          {format.enum(e.subjectType)} {e.subjectId}
                        </Link>
                      ) : (
                        `${format.enum(e.subjectType)} ${e.subjectId ?? ""}`
                      )
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Payload (secrets hidden)</p>
                <JsonBlock value={e.payload} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Headers</p>
                <JsonBlock value={e.headers} />
              </div>
            </div>
          )}
        </SheetContent>
      )}
    </Dialog>
  );
}

function RetryButton({ e }: { e: WebhookEventDetail }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const failed = e.status === "FAILED" || e.status === "RECEIVED";
  return (
    <Button
      variant={failed ? "primary" : "secondary"}
      onClick={() =>
        void confirm({
          title: "Process this webhook again?",
          description: failed ? "Runs it through the provider's handler again. Safe to repeat: a purchase or cash-out only moves forward once." : "It was already handled. Running it again is safe (nothing is paid twice) but usually not needed.",
          confirmLabel: "Retry",
          action: async () => {
            const r = await api.post<{ id: string; status: string; error: string | null; attempts: number }>(`admin/webhooks/${e.id}/retry`);
            if (r.status === "FAILED") toast.error(`Still failing: ${r.error ?? "unknown error"}`);
            else toast.success(`Retried · ${format.enum(r.status)}`);
            await qc.invalidateQueries({ queryKey: integrationKeys.all });
          },
        })
      }
    >
      <RotateCcw /> Retry
    </Button>
  );
}
