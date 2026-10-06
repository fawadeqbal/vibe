"use client";

import { Handshake } from "lucide-react";
import { useRouter } from "next/navigation";

import { Time, UserCell } from "@/components/common/bits";
import { PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useUrlState } from "@/hooks/use-url-state";
import type { AffiliateSummary } from "@/lib/api/types";
import { format } from "@/lib/format";

import { useAffiliates } from "./api";
import { channelText, totalFollowers } from "./format";

const TABS = [
  { value: "PENDING", label: "Applied" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];
const DEFAULTS = { status: "PENDING", q: "" };

const columns: Column<AffiliateSummary>[] = [
  {
    id: "partner",
    header: "Partner",
    cell: (a) => (
      <span className="block leading-tight">
        <span className="font-medium text-text">{a.displayName}</span>
        <span className="block font-mono text-xs text-muted">{a.code}</span>
      </span>
    ),
    className: "min-w-40",
  },
  { id: "user", header: "Account", cell: (a) => <UserCell user={a.user ?? null} size={24} />, className: "hidden md:table-cell min-w-40" },
  {
    id: "channels",
    header: "Channels",
    cell: (a) => (
      <span className="flex flex-wrap gap-1">
        {a.channels.slice(0, 3).map((c, i) => (
          <Badge key={i} tone="outline">
            {channelText(c)}
          </Badge>
        ))}
        {a.channels.length > 3 && <Badge tone="outline">+{a.channels.length - 3}</Badge>}
      </span>
    ),
    className: "hidden lg:table-cell",
  },
  { id: "reach", header: "Followers", cell: (a) => <span className="tabular">{format.compact(totalFollowers(a.channels))}</span>, align: "right", className: "hidden sm:table-cell" },
  {
    id: "terms",
    header: "Terms",
    cell: (a) => (
      <span className="text-xs text-text-2 tabular">
        {a.revSharePercent}% · {format.cents(a.cpaUsdCents)}
        {a.customTerms && (
          <Badge tone="money" className="ml-1">
            Custom
          </Badge>
        )}
      </span>
    ),
    className: "hidden md:table-cell",
  },
  { id: "referrals", header: "Sign-ups", cell: (a) => <span className="tabular">{format.number(a.referrals ?? 0)}</span>, align: "right" },
  { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
  { id: "applied", header: "Applied", cell: (a) => <Time iso={a.appliedAt} className="text-text-2" /> },
];

/** Creator partners: applications to review and everyone in the program. */
export function AffiliatesPage() {
  const router = useRouter();
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const list = useAffiliates({ status: f.status === "ALL" ? undefined : f.status, q: f.q });
  return (
    <div>
      <PageHeader
        title="Affiliates"
        description="Creators who bring people to Vibe and earn a share of what those people spend, plus a fixed amount per active user. Review applications, set terms, and watch for fraud flags."
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
        getRowId={(a) => a.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(a) => router.push(`/affiliates/${a.id}`)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: Handshake, title: f.status === "PENDING" ? "No applications waiting" : "No partners here" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Code, name, e-mail or id" />
            <ResetFilters show={!!f.q} onReset={() => reset()} />
          </FilterBar>
        }
      />
    </div>
  );
}
