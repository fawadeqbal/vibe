"use client";

import { Receipt, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/common/page";
import { DataTable } from "@/components/data-table/data-table";
import { DateRange, FilterBar, FilterMulti, FilterSelect, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { useUrlState } from "@/hooks/use-url-state";
import { format } from "@/lib/format";

import { useLedger, useSubscriptions } from "./api";
import { ledgerColumns, subscriptionColumns } from "./columns";

const KINDS = ["PURCHASE", "SPEND", "EARN", "GIFT_SENT", "GIFT_RECEIVED", "CASHOUT", "CASHOUT_REVERSAL", "VIP", "REFUND", "ADJUSTMENT"];
const LEDGER_DEFAULTS = { q: "", kind: [] as string[], userId: "", from: "", to: "" };

/** Every coin and gem movement, across all users. */
export function LedgerPage() {
  const router = useRouter();
  const [f, setF, reset] = useUrlState(LEDGER_DEFAULTS);
  const list = useLedger({ q: f.q, kind: f.kind, userId: f.userId, from: f.from, to: f.to });
  const filtered = !!(f.q || f.kind.length || f.userId || f.from || f.to);
  return (
    <div>
      <PageHeader title="Ledger" description="Every coin and gem that moved, with the balance after it. Entries are never edited — corrections are new entries." />
      <DataTable
        columns={ledgerColumns(true)}
        rows={list.rows}
        getRowId={(e) => e.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(e) => router.push(`/users/${e.userId}`)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: Receipt, title: "No entries match" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Title or reference" />
            <FilterMulti label="Type" value={f.kind} onChange={(kind) => setF({ kind })} options={KINDS.map((k) => ({ value: k, label: format.enum(k) }))} />
            <SearchInput value={f.userId} onChange={(userId) => setF({ userId })} placeholder="User id" className="sm:w-48" />
            <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
            <ResetFilters show={filtered} onReset={reset} />
          </FilterBar>
        }
      />
    </div>
  );
}

const SUB_DEFAULTS = { q: "", status: [] as string[], planId: "", from: "", to: "" };

export function SubscriptionsPage() {
  const router = useRouter();
  const [f, setF, reset] = useUrlState(SUB_DEFAULTS);
  const list = useSubscriptions({ q: f.q, status: f.status, planId: f.planId, from: f.from, to: f.to });
  const filtered = !!(f.q || f.status.length || f.planId || f.from || f.to);
  return (
    <div>
      <PageHeader title="VIP subscriptions" description="Paid plans, trials and VIP given by staff. Give or end VIP from a user's profile." />
      <DataTable
        columns={subscriptionColumns()}
        rows={list.rows}
        getRowId={(s) => s.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(s) => router.push(`/users/${s.userId}`)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: Sparkles, title: "No subscriptions match" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="User name" />
            <FilterMulti label="Status" value={f.status} onChange={(status) => setF({ status })} options={["TRIALING", "ACTIVE", "CANCELED", "EXPIRED"].map((s) => ({ value: s, label: s === "TRIALING" ? "Trial" : format.enum(s) }))} />
            <FilterSelect
              label="Plan"
              value={f.planId}
              onChange={(planId) => setF({ planId })}
              options={[
                { value: "vip_week", label: "Weekly" },
                { value: "vip_month", label: "Monthly" },
                { value: "vip_year", label: "Yearly" },
                { value: "staff_grant", label: "Given by staff" },
              ]}
            />
            <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
            <ResetFilters show={filtered} onReset={reset} />
          </FilterBar>
        }
      />
    </div>
  );
}
