"use client";

import { Send, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Coins, Gems, Time, UserCell } from "@/components/common/bits";
import { PageHeader } from "@/components/common/page";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { BulkBar, DateRange, FilterBar, FilterBool, FilterSelect, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCan } from "@/features/auth/session";
import { useUrlState } from "@/hooks/use-url-state";
import type { UserSummary } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { useUsers } from "./api";

const DEFAULTS = { q: "", status: "", banned: "", verified: "", vip: "", gender: "", country: "", bots: "", sort: "newest", from: "", to: "" };

export const COUNTRIES = ["PK", "IN", "US", "GB", "TR", "BR", "DE", "FR", "AE", "SA", "ID", "PH", "KR", "JP", "MX", "NG", "EG", "CA", "AU", "ES"];

export function userStateBadges(u: Pick<UserSummary, "status" | "bannedUntil" | "vipUntil" | "openReports">) {
  return (
    <span className="flex flex-wrap gap-1">
      {u.status === "DELETED" && <Badge>Deleted</Badge>}
      {u.bannedUntil && <Badge tone="bad">Banned</Badge>}
      {u.vipUntil && <Badge tone="money">VIP</Badge>}
      {u.openReports > 0 && <Badge tone="warn">{u.openReports} report{u.openReports > 1 ? "s" : ""}</Badge>}
    </span>
  );
}

const columns: Column<UserSummary>[] = [
  { id: "user", header: "User", cell: (u) => <UserCell user={u} sub={u.email ?? (u.age ? `${u.age} · ${format.enum(u.gender)}` : format.enum(u.gender))} />, className: "min-w-56" },
  { id: "state", header: "State", cell: userStateBadges, className: "hidden md:table-cell" },
  { id: "coins", header: "Coins", cell: (u) => <Coins value={u.coins} />, align: "right", className: "hidden sm:table-cell" },
  { id: "gems", header: "Gems", cell: (u) => <Gems value={u.gems} />, align: "right", className: "hidden lg:table-cell" },
  { id: "matches", header: "Matches", cell: (u) => <span className="tabular">{format.number(u.matchesCount)}</span>, align: "right", className: "hidden lg:table-cell" },
  { id: "seen", header: "Last active", cell: (u) => (u.online ? <Badge tone="ok" dot>Online</Badge> : <Time iso={u.lastSeenAt} className="text-text-2" />), className: "hidden xl:table-cell" },
  { id: "joined", header: "Joined", cell: (u) => <Time iso={u.createdAt} className="text-text-2" /> },
];

export function UsersPage() {
  const router = useRouter();
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const list = useUsers({ ...f, sort: f.sort });
  const filtered = Object.entries(f).some(([k, v]) => v !== DEFAULTS[k as keyof typeof DEFAULTS]);
  const can = useCan();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  return (
    <div>
      <PageHeader title="Users" description="Search by name, e-mail, user id or invite code. Click a row to open the profile." />
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(u) => u.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(u) => router.push(`/users/${u.id}`)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        rowClassName={(u) => (u.status === "DELETED" ? "opacity-60" : undefined)}
        selection={can(P.OpsMessages) ? { selected, onChange: setSelected, isSelectable: (u) => u.status === "ACTIVE" && !u.isBot } : undefined}
        empty={{ icon: Users, title: filtered ? "No users match these filters" : "No users yet", description: filtered ? "Try fewer filters or a different search." : undefined }}
        toolbar={
          <>
            <FilterBar
              end={
                <FilterSelect
                  label="Sort"
                  value={f.sort}
                  onChange={(sort) => setF({ sort: sort || "newest" })}
                  allLabel="Newest first"
                  options={[
                    { value: "oldest", label: "Oldest first" },
                    { value: "lastSeen", label: "Recently active" },
                    { value: "mostMatches", label: "Most matches" },
                  ]}
                />
              }
            >
              <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Name, e-mail, id, invite code" />
              <FilterSelect label="Status" value={f.status} onChange={(status) => setF({ status })} options={[{ value: "ACTIVE", label: "Active" }, { value: "DELETED", label: "Deleted" }]} />
              <FilterBool label="Banned" value={f.banned} onChange={(banned) => setF({ banned })} />
              <FilterBool label="Verified" value={f.verified} onChange={(verified) => setF({ verified })} />
              <FilterBool label="VIP" value={f.vip} onChange={(vip) => setF({ vip })} />
              <FilterSelect label="Gender" value={f.gender} onChange={(gender) => setF({ gender })} options={["FEMALE", "MALE", "OTHER"].map((g) => ({ value: g, label: format.enum(g) }))} />
              <FilterSelect label="Country" value={f.country} onChange={(country) => setF({ country })} options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
              <FilterBool label="Dev bots" value={f.bots} onChange={(bots) => setF({ bots })} yes="Include" no="Hide" />
              <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
              <ResetFilters show={filtered} onReset={reset} />
            </FilterBar>
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              <Button size="sm" variant="primary" onClick={() => router.push(`/messages/new?to=${[...selected].slice(0, 100).join(",")}`)}>
                <Send /> Send a message
              </Button>
            </BulkBar>
          </>
        }
      />
    </div>
  );
}
