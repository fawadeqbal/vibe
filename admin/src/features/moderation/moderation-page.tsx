"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Flag, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { ReasonBadge, StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { BulkBar, DateRange, FilterBar, FilterMulti, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Report, ReportedPerson } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { reportKeys, useReportedPeople, useReports, useReportStats } from "./api";

export const REASONS = ["NUDITY", "UNDERAGE", "HARASSMENT", "SCAM", "SPAM", "OTHER"];
const DEFAULTS = { view: "people", q: "", status: ["OPEN"] as string[], reason: [] as string[], reportedId: "", from: "", to: "" };

export function ModerationPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const stats = useReportStats();
  const s = stats.data;

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="Work the queue person by person: the most-reported people first. Banning closes all their open reports." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Open" icon={Flag} tone={s && s.open > 0 ? "warn" : "neutral"} emphasis={!!s && s.open > 0} loading={stats.isLoading} value={format.number(s?.open)} hint={s && Object.entries(s.openByReason).map(([r, n]) => `${n} ${format.enum(r).toLowerCase()}`).join(" · ")} />
        <StatCard label="New today" icon={ShieldAlert} loading={stats.isLoading} value={format.number(s?.today)} />
        <StatCard label="Resolved · 7 days" icon={CheckCircle2} tone="trust" loading={stats.isLoading} value={format.number(s ? s.actioned7d + s.dismissed7d : undefined)} hint={s && `${s.actioned7d} actioned · ${s.dismissed7d} dismissed`} />
        <StatCard label="Time to review" icon={Clock} loading={stats.isLoading} value={s?.avgReviewMinutes == null ? "—" : format.duration(s.avgReviewMinutes * 60)} hint="average, last 7 days" />
      </div>
      <Tabs value={f.view} onValueChange={(view) => setF({ view })}>
        <TabsList>
          <TabsTrigger value="people">By person</TabsTrigger>
          <TabsTrigger value="all">All reports</TabsTrigger>
        </TabsList>
        <div className="pt-4">
          <TabsContent value="people">
            <PeopleQueue onOpen={(id) => setF({ view: "all", reportedId: id, status: ["OPEN"] })} />
          </TabsContent>
          <TabsContent value="all">
            <AllReports f={f} setF={setF} reset={reset} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function PeopleQueue({ onOpen }: { onOpen: (userId: string) => void }) {
  const q = useReportedPeople();
  const columns: Column<ReportedPerson>[] = [
    { id: "user", header: "Person", cell: (p) => <UserCell user={p.user} sub={p.user?.bannedUntil ? "Banned" : undefined} />, className: "min-w-52" },
    { id: "count", header: "Open reports", cell: (p) => <Badge tone={p.openReports >= 3 ? "bad" : "warn"}>{p.openReports}</Badge> },
    { id: "reasons", header: "Reasons", cell: (p) => <span className="flex flex-wrap gap-1">{Object.entries(p.reasons).map(([r, n]) => <ReasonBadge key={r} reason={r} count={n} />)}</span> },
    { id: "last", header: "Latest", cell: (p) => <Time iso={p.lastReportAt} className="text-text-2" /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={q.rows}
      getRowId={(p) => p.user?.id ?? `gone-${p.lastReportAt}`}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => void q.refetch()}
      onRowClick={(p) => p.user && onOpen(p.user.id)}
      hasMore={q.hasNextPage}
      loadingMore={q.isFetchingNextPage}
      onLoadMore={() => void q.fetchNextPage()}
      empty={{ icon: CheckCircle2, title: "Queue is clear", description: "No open reports right now." }}
    />
  );
}

function AllReports({ f, setF, reset }: { f: typeof DEFAULTS; setF: (p: Partial<typeof DEFAULTS>) => void; reset: () => void }) {
  const router = useRouter();
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // No status chosen = every status (the API defaults to open only).
  const list = useReports({ q: f.q, status: f.status.length ? f.status : ["OPEN", "ACTIONED", "DISMISSED"], reason: f.reason, reportedId: f.reportedId, from: f.from, to: f.to });
  const filtered = f.q || f.reason.length || f.reportedId || f.from || f.to || f.status.join() !== "OPEN";

  const bulk = (action: "dismiss" | "ban") =>
    void confirm({
      title: action === "ban" ? `Ban everyone in ${selected.size} reports?` : `Dismiss ${selected.size} reports?`,
      description: action === "ban" ? "Each reported person is banned for 7 days and all their open reports close." : "They close without action. The reported people aren't told.",
      confirmLabel: action === "ban" ? "Ban for 7 days" : "Dismiss",
      tone: action === "ban" ? "danger" : "primary",
      action: async () => {
        await api.post("admin/reports/resolve", { ids: [...selected], action, hours: action === "ban" ? 168 : undefined });
        setSelected(new Set());
        await qc.invalidateQueries({ queryKey: reportKeys.all });
      },
    });

  const columns: Column<Report>[] = [
    { id: "reported", header: "Reported", cell: (r) => <UserCell user={r.reported} size={28} sub={r.reportedOpenReports ? `${r.reportedOpenReports} open` : undefined} />, className: "min-w-48" },
    { id: "reason", header: "Reason", cell: (r) => <ReasonBadge reason={r.reason} /> },
    { id: "note", header: "Note", cell: (r) => <span className="text-text-2">{r.note ?? <span className="text-muted">—</span>}</span>, className: "hidden lg:table-cell max-w-72 truncate" },
    { id: "by", header: "By", cell: (r) => <UserCell user={r.reporter} size={22} />, className: "hidden md:table-cell" },
    { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { id: "at", header: "When", cell: (r) => <Time iso={r.createdAt} className="text-text-2" /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={list.rows}
      getRowId={(r) => r.id}
      loading={list.isLoading}
      error={list.error}
      onRetry={list.refetch}
      onRowClick={(r) => router.push(`/moderation/${r.id}`)}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={list.fetchNextPage}
      selection={can(P.ModerationResolve) ? { selected, onChange: setSelected, isSelectable: (r) => r.status === "OPEN" } : undefined}
      empty={{ icon: CheckCircle2, title: filtered ? "No reports match" : "No open reports" }}
      toolbar={
        <>
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Reported person's name" />
            <FilterMulti label="Status" value={f.status} onChange={(status) => setF({ status })} options={["OPEN", "ACTIONED", "DISMISSED"].map((s) => ({ value: s, label: format.enum(s) }))} />
            <FilterMulti label="Reason" value={f.reason} onChange={(reason) => setF({ reason })} options={REASONS.map((r) => ({ value: r, label: format.enum(r) }))} />
            {f.reportedId && (
              <Button size="sm" className="h-8 border-primary/40 bg-primary-soft text-xs text-primary" onClick={() => setF({ reportedId: "" })}>
                One person ✕
              </Button>
            )}
            <DateRange from={f.from} to={f.to} onChange={(r) => setF(r)} />
            <ResetFilters show={!!filtered} onReset={reset} />
          </FilterBar>
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            <Button size="sm" onClick={() => bulk("dismiss")}>
              Dismiss
            </Button>
            <Button size="sm" variant="danger" onClick={() => bulk("ban")}>
              Ban 7 days
            </Button>
          </BulkBar>
        </>
      }
    />
  );
}
