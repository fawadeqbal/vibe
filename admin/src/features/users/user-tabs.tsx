"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Time, UserCell } from "@/components/common/bits";
import { EmptyState } from "@/components/common/page";
import { ReasonBadge, StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/controls";
import { Textarea } from "@/components/ui/input";
import { AuditTable } from "@/features/audit/audit-table";
import { CashoutSheet } from "@/features/finance/cashout-sheet";
import { cashoutColumns, ledgerColumns, purchaseColumns } from "@/features/finance/columns";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { Cashout, MatchRow, Report } from "@/lib/api/types";
import { format } from "@/lib/format";

import { useUserAudit, useUserCashouts, useUserLedger, useUserMatches, useUserNotes, useUserPurchases, useUserReports, userKeys } from "./api";

type Paged = { rows: unknown[]; isLoading: boolean; error: unknown; refetch: () => void; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void };
const paging = (q: Paged) => ({ loading: q.isLoading, error: q.error, onRetry: q.refetch, hasMore: q.hasNextPage, loadingMore: q.isFetchingNextPage, onLoadMore: q.fetchNextPage });

const matchColumns: Column<MatchRow>[] = [
  { id: "partner", header: "With", cell: (m) => <UserCell user={m.partner} size={26} />, className: "min-w-44" },
  { id: "length", header: "Length", cell: (m) => <span className="tabular">{m.endedAt ? format.duration(m.seconds) : <Badge tone="ok" dot>Live</Badge>}</span> },
  { id: "end", header: "Ended", cell: (m) => (m.endReason ? <span className="text-text-2">{format.enum(m.endReason)}{m.endedByMe ? " by them" : ""}</span> : <span className="text-muted">—</span>), className: "hidden md:table-cell" },
  { id: "coins", header: "Paid", cell: (m) => (m.coinsSpent ? `${m.coinsSpent} coins` : <span className="text-muted">—</span>), align: "right", className: "hidden sm:table-cell" },
  { id: "at", header: "When", cell: (m) => <Time iso={m.startedAt} className="text-text-2" /> },
];

export function MatchesTab({ userId }: { userId: string }) {
  const q = useUserMatches(userId);
  return <DataTable columns={matchColumns} rows={q.rows} getRowId={(m) => m.id} {...paging(q)} empty={{ title: "No matches yet" }} />;
}

export function LedgerTab({ userId }: { userId: string }) {
  const q = useUserLedger(userId);
  return <DataTable columns={ledgerColumns(false)} rows={q.rows} getRowId={(e) => e.id} {...paging(q)} empty={{ title: "No wallet activity" }} />;
}

export function PurchasesTab({ userId }: { userId: string }) {
  const router = useRouter();
  const q = useUserPurchases(userId);
  return <DataTable columns={purchaseColumns(false)} rows={q.rows} getRowId={(p) => p.id} {...paging(q)} onRowClick={(p) => router.push(`/finance/purchases?open=${p.id}`)} empty={{ title: "No purchases" }} />;
}

export function CashoutsTab({ userId }: { userId: string }) {
  const q = useUserCashouts(userId);
  const [open, setOpen] = React.useState<Cashout | null>(null);
  return (
    <>
      <DataTable columns={cashoutColumns(false)} rows={q.rows} getRowId={(c) => c.id} {...paging(q)} onRowClick={setOpen} empty={{ title: "No cash-outs" }} />
      <CashoutSheet cashout={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function ReportsTab({ userId }: { userId: string }) {
  const router = useRouter();
  const [direction, setDirection] = React.useState<"received" | "made">("received");
  const q = useUserReports(userId, { direction });
  const columns: Column<Report>[] = [
    { id: "reason", header: "Reason", cell: (r) => <ReasonBadge reason={r.reason} /> },
    { id: "who", header: direction === "received" ? "Reported by" : "Reported", cell: (r) => <UserCell user={direction === "received" ? r.reporter : r.reported} size={24} /> },
    { id: "note", header: "Note", cell: (r) => <span className="text-text-2">{r.note ?? ""}</span>, className: "hidden lg:table-cell max-w-64 truncate" },
    { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { id: "at", header: "When", cell: (r) => <Time iso={r.createdAt} className="text-text-2" /> },
  ];
  return (
    <div className="space-y-3">
      <Segmented value={direction} onChange={setDirection} options={[{ value: "received", label: "About them" }, { value: "made", label: "By them" }]} />
      <DataTable columns={columns} rows={q.rows} getRowId={(r) => r.id} {...paging(q)} onRowClick={(r) => router.push(`/moderation/${r.id}`)} empty={{ title: direction === "received" ? "Nobody has reported them" : "They haven't reported anyone" }} />
    </div>
  );
}

export function NotesTab({ userId }: { userId: string }) {
  const notes = useUserNotes(userId);
  const [text, setText] = React.useState("");
  const add = useAction(() => api.post(`admin/users/${userId}/notes`, { text }), { success: "Note added", invalidate: [userKeys.sub(userId, "notes")], onSuccess: () => setText("") });
  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an internal note — visible to staff only" rows={3} maxLength={2000} aria-label="New note" />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" loading={add.isPending} disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      </form>
      {notes.isLoading ? (
        <Skeleton className="h-20" />
      ) : !notes.data?.length ? (
        <EmptyState title="No notes yet" description="Notes help the next person who looks at this account." />
      ) : (
        <ul className="space-y-2">
          {notes.data.map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
              <p className="text-sm whitespace-pre-wrap text-text">{n.text}</p>
              <p className="mt-1.5 text-xs text-muted">
                {n.author.name} · <Time iso={n.createdAt} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuditTab({ userId }: { userId: string }) {
  const q = useUserAudit(userId);
  return <AuditTable rows={q.rows} {...paging(q)} showTarget={false} />;
}
