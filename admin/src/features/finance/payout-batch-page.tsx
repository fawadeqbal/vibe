"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Download, Layers } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Gems, IdChip, Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { api, saveFile } from "@/lib/api/client";
import type { PayoutBatch, PayoutBatchDetail } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { financeKeys, usePayoutBatch } from "./api";
import { CashoutSheet } from "./cashout-sheet";
import { ProviderStatusText } from "./columns";
import { BATCH_HOW_TO } from "./payout-batches-page";

type Row = PayoutBatchDetail["cashouts"][number];

const columns: Column<Row>[] = [
  { id: "user", header: "User", cell: (c) => <UserCell user={c.user} size={26} />, className: "min-w-40" },
  { id: "pkr", header: "Amount", cell: (c) => <span className="font-medium tabular">{format.pkr(c.amountPkr)}</span>, align: "right" },
  { id: "usd", header: "USD", cell: (c) => <span className="text-text-2 tabular">{format.cents(c.usdCents)}</span>, align: "right", className: "hidden sm:table-cell" },
  { id: "gems", header: "Gems", cell: (c) => <Gems value={c.gems} />, align: "right", className: "hidden lg:table-cell" },
  { id: "to", header: "Account", cell: (c) => <span className="font-mono text-xs text-text-2">{c.accountMasked}</span>, className: "hidden md:table-cell" },
  {
    id: "status",
    header: "Status",
    cell: (c) => (
      <span className="flex flex-col items-start gap-0.5">
        <StatusBadge status={c.status} />
        {c.providerStatus && c.status === "PROCESSING" && <ProviderStatusText value={c.providerStatus} className="text-[11px]" />}
      </span>
    ),
  },
  { id: "at", header: "Requested", cell: (c) => <Time iso={c.createdAt} className="text-text-2" />, className: "hidden md:table-cell" },
];

export function PayoutBatchPage({ id }: { id: string }) {
  const q = usePayoutBatch(id);
  const [open, setOpen] = React.useState<Row | null>(null);
  const b = q.data;

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div>
      <PageHeader
        back={{ href: "/finance/payout-batches", label: "Payout batches" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {b ? `Batch of ${format.date(b.createdAt)}` : "Payout batch"}
            {b && <StatusBadge status={b.status} />}
          </span>
        }
        description={BATCH_HOW_TO}
        actions={b && <BatchActions b={b} />}
      />
      {!b ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-5">
          <Steps b={b} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Cash-outs" value={format.number(b.count)} icon={Layers} />
            <StatCard label="Total to send" value={format.pkr(b.totalPkr)} />
            <StatCard label="In USD" value={format.cents(b.totalUsdCents)} hint="At each request's rate" />
          </div>
          <Card>
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  { label: "Batch id", value: <IdChip id={b.id} /> },
                  { label: "Method", value: format.enum(b.method) },
                  { label: "Created", value: format.dateTime(b.createdAt) },
                  { label: "CSV downloaded", value: format.dateTime(b.exportedAt) },
                  { label: "Paid", value: format.dateTime(b.paidAt) },
                  { label: "Bank reference", value: b.reference ? <IdChip id={b.reference} label="Reference" /> : "—" },
                ]}
              />
            </CardBody>
          </Card>
          <DataTable columns={columns} rows={b.cashouts} getRowId={(c) => c.id} onRowClick={setOpen} empty={{ icon: Layers, title: "No cash-outs in this batch" }} />
        </div>
      )}
      <CashoutSheet cashout={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Download → upload to the bank → mark paid, with what's done ticked. */
function Steps({ b }: { b: PayoutBatch }) {
  if (b.status === "CANCELED") {
    return <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">This batch was cancelled. Its unpaid cash-outs went back to waiting and can join the next batch.</p>;
  }
  const steps = [
    { label: "Download the CSV", done: !!b.exportedAt || b.status === "PAID" },
    { label: "Upload it to your bank's bulk transfer", done: b.status === "PAID" },
    { label: "Mark paid with the bank's reference", done: b.status === "PAID" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.label} className={cn("flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-card", s.done ? "text-text-2" : "text-text")}>
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.done ? "bg-ok-soft text-ok" : "bg-surface-3 text-text-2")}>{s.done ? <Check className="size-3.5" /> : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function BatchActions({ b }: { b: PayoutBatchDetail }) {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [paying, setPaying] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  if (!can(P.FinanceCashouts)) return null;
  const unpaid = b.status === "OPEN" || b.status === "EXPORTED";

  const download = async () => {
    setDownloading(true);
    try {
      const { blob, filename } = await api.blob(`admin/payout-batches/${b.id}/export`);
      saveFile(blob, filename ?? `vibe-payouts-${b.id}.csv`);
      toast.success("CSV downloaded", { description: "It has full account numbers. Delete it once it's uploaded to the bank." });
      await qc.invalidateQueries({ queryKey: financeKeys.batches });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {b.status !== "CANCELED" && (
        <Button onClick={() => void download()} loading={downloading}>
          <Download /> Download CSV
        </Button>
      )}
      {unpaid && (
        <>
          <Button variant="primary" onClick={() => setPaying(true)}>
            <Check /> Mark paid
          </Button>
          <Button
            variant="danger-ghost"
            onClick={() =>
              void confirm({
                title: "Cancel this batch?",
                description: `Its ${b.count} cash-out${b.count === 1 ? "" : "s"} go back to waiting and can join the next batch.${b.exportedAt ? " If you already uploaded the CSV to your bank, stop that transfer there too." : ""}`,
                confirmLabel: "Cancel batch",
                tone: "danger",
                action: async () => {
                  await api.post(`admin/payout-batches/${b.id}/cancel`);
                  toast.success("Batch cancelled");
                  await qc.invalidateQueries({ queryKey: financeKeys.all });
                },
              })
            }
          >
            <Ban /> Cancel batch
          </Button>
        </>
      )}
      {paying && <MarkBatchPaidDialog b={b} onClose={() => setPaying(false)} />}
    </>
  );
}

function MarkBatchPaidDialog({ b, onClose }: { b: PayoutBatchDetail; onClose: () => void }) {
  const [ref, setRef] = React.useState("");
  const paid = useAction(() => api.post<PayoutBatch>(`admin/payout-batches/${b.id}/paid`, { ref: ref.trim() }), {
    success: `Batch marked paid · ${b.count} cash-out${b.count === 1 ? "" : "s"} paid`,
    invalidate: [financeKeys.all, ["dashboard"]],
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !paid.isPending && onClose()}>
      <DialogContent
        size="sm"
        title="Mark the batch paid"
        description={`Only after your bank has sent ${format.pkr(b.totalPkr)} to ${b.count} account${b.count === 1 ? "" : "s"}. Every cash-out in it is marked paid.`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={paid.isPending}>
              Cancel
            </Button>
            <Button variant="primary" loading={paid.isPending} disabled={!ref.trim()} onClick={() => paid.mutate()}>
              Mark paid
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ref.trim()) paid.mutate();
          }}
        >
          <Field label="Bank reference" hint="The bulk transfer's reference from your bank.">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. BULK-2026-10-05-01" maxLength={200} autoFocus />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
