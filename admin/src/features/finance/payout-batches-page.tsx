"use client";

import { Layers, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { IdChip, Time } from "@/components/common/bits";
import { PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { PayoutBatch } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { financeKeys, usePayoutBatches, usePayoutWaiting } from "./api";

export const BATCH_HOW_TO = "Download the CSV, upload it to your bank's bulk transfer, then mark the batch paid with the bank's reference.";

const columns: Column<PayoutBatch>[] = [
  { id: "created", header: "Created", cell: (b) => <Time iso={b.createdAt} mode="dateTime" className="font-medium text-text" /> },
  { id: "status", header: "Status", cell: (b) => <StatusBadge status={b.status} /> },
  { id: "count", header: "Cash-outs", cell: (b) => <span className="tabular">{format.number(b.count)}</span>, align: "right", className: "hidden sm:table-cell" },
  { id: "pkr", header: "Total", cell: (b) => <span className="font-medium tabular">{format.pkr(b.totalPkr)}</span>, align: "right" },
  { id: "usd", header: "USD", cell: (b) => <span className="text-text-2 tabular">{format.cents(b.totalUsdCents)}</span>, align: "right", className: "hidden md:table-cell" },
  { id: "ref", header: "Bank reference", cell: (b) => (b.reference ? <IdChip id={b.reference} label="Reference" className="max-w-40" /> : <span className="text-muted">—</span>), className: "hidden md:table-cell" },
  { id: "paid", header: "Paid", cell: (b) => <Time iso={b.paidAt} className="text-text-2" />, className: "hidden lg:table-cell" },
];

/** Bank cash-outs are paid together: collect what's waiting into a batch, export, pay, mark paid. */
export function PayoutBatchesPage() {
  const router = useRouter();
  const can = useCan();
  const waiting = usePayoutWaiting();
  const list = usePayoutBatches();
  const create = useAction(() => api.post<PayoutBatch>("admin/payout-batches"), {
    success: (b) => `Batch created with ${b.count} cash-out${b.count === 1 ? "" : "s"}`,
    invalidate: [financeKeys.all],
    onSuccess: (b) => router.push(`/finance/payout-batches/${b.id}`),
  });
  const w = waiting.data;

  return (
    <div>
      <PageHeader title="Payout batches" description={`Bank cash-outs are paid together. ${BATCH_HOW_TO}`} />
      <Card className={cn("mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center", w?.count && "border-money/40")}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-money-soft text-money">
          <Layers className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          {waiting.isLoading ? (
            <Skeleton className="h-10 w-56" />
          ) : waiting.error ? (
            <p className="text-sm text-bad">{(waiting.error as Error).message}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-text">
                {w?.count ? (
                  <>
                    {format.number(w.count)} bank cash-out{w.count === 1 ? "" : "s"} waiting · <span className="tabular">{format.pkr(w.totalPkr)}</span>
                  </>
                ) : (
                  "No bank cash-outs waiting"
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted">{w?.count ? `${format.usd(w.totalUsd)}. Rupee amounts were fixed when each cash-out was requested.` : "Approved bank cash-outs show up here until they're put in a batch."}</p>
            </>
          )}
        </div>
        {can(P.FinanceCashouts) && (
          <Button variant="primary" onClick={() => create.mutate()} loading={create.isPending} disabled={!w?.count}>
            <Plus /> Create batch
          </Button>
        )}
      </Card>
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        getRowId={(b) => b.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(b) => router.push(`/finance/payout-batches/${b.id}`)}
        empty={{ icon: Layers, title: "No batches yet", description: "Create one when bank cash-outs are waiting." }}
      />
    </div>
  );
}
