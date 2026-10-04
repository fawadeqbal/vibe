"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/common/page";
import { DateRange, FilterBar, FilterSelect, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { useCursorQuery } from "@/hooks/use-cursor-query";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { AuditEntry, Page } from "@/lib/api/types";

import { AuditTable } from "./audit-table";

const DEFAULTS = { q: "", action: "", targetType: "", from: "", to: "" };

export function AuditPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const actions = useQuery({ queryKey: ["audit", "actions"], queryFn: ({ signal }) => api.get<{ action: string; count: number }[]>("admin/audit/actions", undefined, signal), staleTime: 60_000 });
  const list = useCursorQuery<AuditEntry>(["audit", "list", f], (cursor, signal) => api.get<Page<AuditEntry>>("admin/audit", { ...f, cursor, limit: 40 }, signal));
  const groups = [...new Set((actions.data ?? []).map((a) => a.action.split(".")[0]))];
  const filtered = Object.values(f).some(Boolean);

  return (
    <div>
      <PageHeader title="Audit log" description="Every action anyone took in this panel, including sign-ins and failed attempts. Click a row to see the request." />
      <AuditTable
        rows={list.rows}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Staff e-mail, details or target id" />
            <FilterSelect
              label="Action"
              value={f.action}
              onChange={(action) => setF({ action })}
              options={[...groups.map((g) => ({ value: `${g}.`, label: `${g}.* (all)` })), ...(actions.data ?? []).map((a) => ({ value: a.action, label: `${a.action} · ${a.count}` }))]}
            />
            <FilterSelect
              label="On"
              value={f.targetType}
              onChange={(targetType) => setF({ targetType })}
              options={["user", "report", "purchase", "cashout", "staff", "role", "setting", "announcement", "match"].map((t) => ({ value: t, label: t }))}
            />
            <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
            <ResetFilters show={filtered} onReset={reset} />
          </FilterBar>
        }
      />
    </div>
  );
}
