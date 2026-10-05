"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Layers, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/confirm";
import { PageHeader } from "@/components/common/page";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { DateRange, FilterBar, FilterMulti, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Cashout } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { financeKeys, useCashouts } from "./api";
import { CashoutSheet } from "./cashout-sheet";
import { cashoutColumns } from "./columns";

const TABS = [
  { value: "REVIEW", label: "Needs review" },
  { value: "PROCESSING", label: "Processing" },
  { value: "REQUESTED", label: "Queued" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];
const DEFAULTS = { status: "REVIEW", q: "", method: [] as string[], from: "", to: "", open: "" };

export function CashoutsPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const can = useCan();
  const list = useCashouts({ status: f.status === "ALL" ? undefined : f.status, q: f.q, method: f.method, from: f.from, to: f.to });
  const [paying, setPaying] = React.useState<Cashout | null>(null);
  const actions = useCashoutActions();
  const opened = f.open ? (list.rows.find((c) => c.id === f.open) ?? null) : null;

  const columns: Column<Cashout>[] = [
    ...cashoutColumns(true),
    ...(can(P.FinanceCashouts)
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            cell: (c: Cashout) => (
              <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <CashoutButtons c={c} actions={actions} onPay={setPaying} compact />
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Cash-outs"
        description="Gems people turn into money. Large ones and everything while payouts are on hold wait here for approval; rejecting returns the gems. Bank cash-outs are paid in payout batches."
        actions={
          <Button size="sm" asChild>
            <Link href="/finance/payout-batches">
              <Layers /> Payout batches
            </Link>
          </Button>
        }
      />
      <Tabs value={f.status} onValueChange={(status) => setF({ status })}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(c) => c.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(c) => setF({ open: c.id })}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: Banknote, title: f.status === "REVIEW" ? "Nothing waiting for approval" : "No cash-outs here" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Cash-out id, reference, user name" />
            <FilterMulti label="Method" value={f.method} onChange={(method) => setF({ method })} options={["JAZZCASH", "EASYPAISA", "BANK"].map((m) => ({ value: m, label: format.enum(m) }))} />
            <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
            <ResetFilters show={!!(f.q || f.method.length || f.from || f.to)} onReset={() => reset()} />
          </FilterBar>
        }
      />
      <CashoutSheet cashout={opened} onClose={() => setF({ open: "" })} footer={opened && can(P.FinanceCashouts) && isOpenCashout(opened) ? <CashoutButtons c={opened} actions={actions} onPay={setPaying} /> : undefined} />
      {paying && <MarkPaidDialog cashout={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

const isOpenCashout = (c: Cashout) => ["REVIEW", "REQUESTED", "PROCESSING"].includes(c.status);

function CashoutButtons({ c, actions, onPay, compact }: { c: Cashout; actions: ReturnType<typeof useCashoutActions>; onPay: (c: Cashout) => void; compact?: boolean }) {
  const size = compact ? "xs" : "sm";
  return (
    <>
      {c.status === "REVIEW" && (
        <Button size={size} variant="trust" onClick={() => actions.approve(c)}>
          <Check /> Approve
        </Button>
      )}
      {isOpenCashout(c) && (
        <>
          <Button size={size} onClick={() => onPay(c)}>
            Mark paid
          </Button>
          <Button size={size} variant="danger-ghost" onClick={() => actions.reject(c)} aria-label="Reject">
            <X />
            {!compact && "Reject"}
          </Button>
        </>
      )}
    </>
  );
}

function useCashoutActions() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: financeKeys.all }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
  return {
    approve: (c: Cashout) =>
      void confirm({
        title: `Approve ${format.usd(c.usd)} to ${c.user?.name ?? "this user"}?`,
        description: `It goes to the payout provider now (${c.amountPkr != null ? `${format.pkr(c.amountPkr)} to ` : ""}${format.enum(c.method)} ${c.accountMasked}).${c.method === "BANK" ? " Bank cash-outs then wait for a payout batch." : ""}`,
        confirmLabel: "Approve and pay",
        action: async () => {
          await api.post(`admin/cashouts/${c.id}/approve`);
          toast.success("Approved — payout sent");
          await refresh();
        },
      }),
    reject: (c: Cashout) =>
      void confirm({
        title: `Reject this ${format.usd(c.usd)} cash-out?`,
        description: `${format.number(c.gems)} gems go back to their wallet.`,
        confirmLabel: "Reject",
        tone: "danger",
        reason: { label: "Reason (the user may see this)", placeholder: "e.g. Account name doesn't match" },
        action: async ({ reason }) => {
          await api.post(`admin/cashouts/${c.id}/reject`, { reason });
          toast.success("Rejected — gems returned");
          await refresh();
        },
      }),
  };
}

function MarkPaidDialog({ cashout, onClose }: { cashout: Cashout; onClose: () => void }) {
  const qc = useQueryClient();
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`admin/cashouts/${cashout.id}/paid`, { ref });
      toast.success("Marked as paid");
      await qc.invalidateQueries({ queryKey: financeKeys.all });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title="Mark as paid"
        description={`Only after you've sent ${cashout.amountPkr != null ? format.pkr(cashout.amountPkr) : format.usd(cashout.usd)} yourself (${format.enum(cashout.method)} ${cashout.accountMasked}).`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={!ref.trim()} onClick={() => void submit()}>
              Mark paid
            </Button>
          </>
        }
      >
        <Field label="Transfer reference">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. JC-2026-10-01-7781" autoFocus />
        </Field>
      </DialogContent>
    </Dialog>
  );
}
