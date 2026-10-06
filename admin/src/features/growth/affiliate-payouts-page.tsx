"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Eye, HandCoins, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { PageHeader } from "@/components/common/page";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { AffiliatePayout } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { payoutColumns } from "./affiliate-page";
import { growthKeys, useAffiliatePayouts } from "./api";

const TABS = [
  { value: "REQUESTED", label: "To pay" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];
const DEFAULTS = { status: "REQUESTED", q: "" };

interface Destination {
  method: string;
  account: string;
  holderName: string;
  bankName?: string;
}

/** Partner withdrawals: pay them by hand (wallet or bank transfer), then mark paid with the reference. */
export function AffiliatePayoutsPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const can = useCan();
  const list = useAffiliatePayouts({ status: f.status === "ALL" ? undefined : f.status, q: f.q });
  const [paying, setPaying] = React.useState<AffiliatePayout | null>(null);
  const confirm = useConfirm();
  const qc = useQueryClient();

  const reject = (p: AffiliatePayout) =>
    void confirm({
      title: `Reject this ${format.cents(p.usdCents)} payout?`,
      description: "The money goes back to the partner's available balance; they can request again.",
      confirmLabel: "Reject",
      tone: "danger",
      reason: { label: "Reason (the partner sees this)", placeholder: "e.g. Account name doesn't match", required: true, minLength: 3 },
      action: async ({ reason }) => {
        await api.post(`admin/affiliate-payouts/${p.id}/reject`, { reason });
        toast.success("Payout rejected — balance returned");
        await Promise.all([qc.invalidateQueries({ queryKey: growthKeys.all }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
      },
    });

  const columns: Column<AffiliatePayout>[] = [
    {
      id: "partner",
      header: "Partner",
      cell: (p) =>
        p.affiliate ? (
          <Link href={`/affiliates/${p.affiliate.id}`} className="block leading-tight hover:text-primary">
            <span className="font-medium text-text">{p.affiliate.displayName}</span>
            <span className="block font-mono text-xs text-muted">{p.affiliate.code}</span>
          </Link>
        ) : (
          "—"
        ),
      className: "min-w-40",
    },
    ...payoutColumns,
    ...(can(P.Affiliates)
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            cell: (p: AffiliatePayout) =>
              p.status === "REQUESTED" ? (
                <span className="flex justify-end gap-1">
                  <Button size="xs" onClick={() => setPaying(p)}>
                    Mark paid
                  </Button>
                  <Button size="xs" variant="danger-ghost" aria-label="Reject" onClick={() => reject(p)}>
                    <X />
                  </Button>
                </span>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title="Affiliate payouts" description="Partners withdraw their whole available balance to a saved JazzCash, Easypaisa or bank account. Send the money yourself, then mark it paid with the transfer reference." />
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
        getRowId={(p) => p.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: HandCoins, title: f.status === "REQUESTED" ? "No payouts to send" : "No payouts here" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Partner code or name, payout id, reference" />
            <ResetFilters show={!!f.q} onReset={() => reset()} />
          </FilterBar>
        }
      />
      {paying && <MarkPaidDialog payout={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function MarkPaidDialog({ payout: p, onClose }: { payout: AffiliatePayout; onClose: () => void }) {
  const qc = useQueryClient();
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dest, setDest] = React.useState<Destination | null>(null);
  const [loadingDest, setLoadingDest] = React.useState(false);

  const reveal = async () => {
    setLoadingDest(true);
    try {
      setDest(await api.get<Destination>(`admin/affiliate-payouts/${p.id}/destination`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingDest(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`admin/affiliate-payouts/${p.id}/paid`, { reference: ref.trim() });
      toast.success("Marked as paid");
      await Promise.all([qc.invalidateQueries({ queryKey: growthKeys.all }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
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
        title="Mark payout as paid"
        description={`Only after you've sent ${format.pkr(p.amountPkr)} (${format.cents(p.usdCents)}) to ${format.enum(p.method)} ${p.accountMasked}.`}
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
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
            {dest ? (
              <dl className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">Account</dt>
                  <dd className="flex items-center gap-1 font-mono text-text">
                    {dest.account} <CopyButton value={dest.account} label="Account copied" title="Copy account" />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Name</dt>
                  <dd className="text-text">{dest.holderName}</dd>
                </div>
                {dest.bankName && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Bank</dt>
                    <dd className="text-text">{dest.bankName}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <Button size="sm" variant="ghost" loading={loadingDest} onClick={() => void reveal()}>
                <Eye /> Show full account
              </Button>
            )}
          </div>
          <Field label="Transfer reference">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. JC-2026-10-06-7781" autoFocus />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
