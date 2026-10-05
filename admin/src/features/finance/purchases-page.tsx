"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Coins, IdChip, JsonBlock, Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable } from "@/components/data-table/data-table";
import { DateRange, FilterBar, FilterMulti, FilterSelect, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { userKeys } from "@/features/users/api";
import { useAction } from "@/hooks/use-action";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Purchase } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { financeKeys, METHODS, usePurchase, usePurchases } from "./api";
import { LEDGER_KIND_TONE, productLabel, purchaseColumns } from "./columns";
import { ProviderTrail } from "./provider-trail";

const DEFAULTS = { q: "", status: [] as string[], method: [] as string[], productType: "", from: "", to: "", open: "" };

export function PurchasesPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const list = usePurchases({ q: f.q, status: f.status, method: f.method, productType: f.productType, from: f.from, to: f.to });
  const filtered = !!(f.q || f.status.length || f.method.length || f.productType || f.from || f.to);
  return (
    <div>
      <PageHeader title="Purchases" description="Every coin pack and VIP payment. Open one to confirm a bank transfer, refund it, or see each step with the provider." />
      <DataTable
        columns={purchaseColumns(true)}
        rows={list.rows}
        getRowId={(p) => p.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(p) => setF({ open: p.id })}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: CreditCard, title: filtered ? "No purchases match" : "No purchases yet" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Purchase id, receipt, user name" />
            <FilterMulti label="Status" value={f.status} onChange={(status) => setF({ status })} options={["REQUIRES_ACTION", "PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "EXPIRED"].map((s) => ({ value: s, label: s === "REQUIRES_ACTION" ? "Needs action" : format.enum(s) }))} />
            <FilterMulti label="Method" value={f.method} onChange={(method) => setF({ method })} options={METHODS.map((m) => ({ value: m, label: format.enum(m) }))} />
            <FilterSelect label="Product" value={f.productType} onChange={(productType) => setF({ productType })} options={[{ value: "COIN_PACK", label: "Coin packs" }, { value: "VIP_PLAN", label: "VIP" }]} />
            <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
            <ResetFilters show={filtered} onReset={reset} />
          </FilterBar>
        }
      />
      <PurchaseSheet id={f.open || null} onClose={() => setF({ open: "" })} />
    </div>
  );
}

function PurchaseSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = usePurchase(id);
  const p = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
        <SheetContent title={p ? productLabel(p) : "Purchase"} description={p ? `${format.usd(p.usd)}${charged(p) ? ` (${charged(p)})` : ""} · ${format.enum(p.method)}` : undefined} footer={p && <PurchaseActions p={p} />}>
          {!p ? (
            <Skeleton className="h-60" />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <UserCell user={p.user ?? null} />
                <StatusBadge status={p.status} />
              </div>
              <DescriptionList
                items={[
                  { label: "Purchase id", value: <IdChip id={p.id} /> },
                  { label: "Provider reference", value: p.providerRef ? <IdChip id={p.providerRef} label="Reference" /> : "—" },
                  { label: "Charged", value: charged(p), hidden: !charged(p) },
                  { label: "Store reference", value: p.storeRef ? <IdChip id={p.storeRef} label="Store reference" /> : "—", hidden: !p.storeRef },
                  { label: "Created", value: format.dateTime(p.createdAt) },
                  { label: "Completed", value: format.dateTime(p.completedAt) },
                  { label: waiting(p) ? "Expires" : "Expired", value: format.dateTime(p.expiresAt), hidden: !p.expiresAt || !(waiting(p) || p.status === "EXPIRED") },
                  { label: "Refunded", value: format.dateTime(p.refundedAt), hidden: !p.refundedAt },
                  { label: "Next step", value: p.nextAction ? format.enum(p.nextAction) : "—", hidden: !p.nextAction },
                  { label: "Failure", value: p.failureReason ?? "—", hidden: !p.failureReason },
                ]}
              />
              {p.actionData && waiting(p) && (
                <details className="group text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">What the user was asked to do</summary>
                  <JsonBlock value={p.actionData} className="mt-2" />
                </details>
              )}
              {p.metadata?.refund && (
                <div className="rounded-lg border border-info/30 bg-info-soft px-3 py-2.5 text-sm text-text">
                  <p className="font-medium">Refunded {format.dateTime(p.metadata.refund.at)}</p>
                  <p className="text-text-2">“{p.metadata.refund.reason}” · {p.metadata.refund.coinsClawedBack} coins taken back{p.metadata.refund.coinsShortfall ? `, ${p.metadata.refund.coinsShortfall} already spent` : ""}</p>
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Wallet entries</p>
                {!p.ledger?.length ? (
                  <p className="text-sm text-muted">None yet.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {p.ledger.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <Badge tone={LEDGER_KIND_TONE[e.kind]}>{format.enum(e.kind)}</Badge>
                        <span className="flex-1 truncate text-text-2">{e.title}</span>
                        {e.coins !== 0 && <Coins value={e.coins} signed />}
                        <Time iso={e.createdAt} className="text-xs text-muted" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ProviderTrail kind="purchases" id={p.id} />
            </div>
          )}
        </SheetContent>
      )}
    </Dialog>
  );
}

const waiting = (p: Purchase) => p.status === "REQUIRES_ACTION" || p.status === "PENDING";

/** The local-currency amount, when it wasn't charged in USD (e.g. "PKR 1,397"). */
const charged = (p: Purchase) => (p.currency && p.currency !== "USD" && p.amountMinor != null ? format.money(p.amountMinor, p.currency) : null);

function PurchaseActions({ p }: { p: Purchase }) {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [ref, setRef] = React.useState("");
  const invalidate = [financeKeys.all, userKeys.detail(p.userId)];
  const markPaid = useAction(() => api.post(`admin/purchases/${p.id}/mark-paid`, { ref }), { success: "Payment confirmed and delivered", invalidate });

  if (waiting(p) && can(P.FinancePurchases)) {
    return (
      <form
        className="flex w-full items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          markPaid.mutate();
        }}
      >
        <Field label="Bank / provider reference" className="flex-1">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. TXN-88213" />
        </Field>
        <Button type="submit" variant="primary" loading={markPaid.isPending} disabled={!ref.trim()}>
          Mark as paid
        </Button>
      </form>
    );
  }
  if (p.status === "SUCCEEDED" && can(P.FinanceRefunds)) {
    return (
      <Button
        variant="danger-ghost"
        onClick={() =>
          void confirm({
            title: "Refund this purchase?",
            description: "Takes back the coins (as many as they still have) or ends the VIP. Issue the money refund in the payment provider's console too.",
            confirmLabel: "Refund",
            tone: "danger",
            reason: { placeholder: "e.g. Chargeback, accidental purchase" },
            action: async ({ reason }) => {
              const r = await api.post<{ coinsClawedBack: number; coinsShortfall: number }>(`admin/purchases/${p.id}/refund`, { reason });
              toast.success(`Refunded · ${r.coinsClawedBack} coins taken back${r.coinsShortfall ? ` (${r.coinsShortfall} already spent)` : ""}`);
              await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
            },
          })
        }
      >
        Refund
      </Button>
    );
  }
  return null;
}
