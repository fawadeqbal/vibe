"use client";

import { ChevronRight, FileClock } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import type { AuditEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const TARGET_HREF: Record<string, (id: string) => string> = {
  user: (id) => `/users/${id}`,
  report: (id) => `/moderation/${id}`,
  staff: (id) => `/team/${id}`,
};

const tone = (action: string) =>
  /banned|deleted|refunded|rejected|failed|locked|revoked|disabled|reset/.test(action) ? "bad" : /adjusted|granted|changed|setting|role\./.test(action) ? "warn" : /login|created|published|approved|paid/.test(action) ? "ok" : "neutral";

/** Audit entries with expandable request data. Used on the audit page and user history. */
export function AuditTable({ rows, loading, error, onRetry, hasMore, loadingMore, onLoadMore, showTarget = true, toolbar }: {
  rows: AuditEntry[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  showTarget?: boolean;
  toolbar?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const columns: Column<AuditEntry>[] = [
    {
      id: "action",
      header: "Action",
      cell: (e) => (
        <span className="flex items-center gap-2">
          <ChevronRight className={cn("size-3.5 text-muted transition-transform", open === e.id && "rotate-90")} />
          <Badge tone={tone(e.action)} className="font-mono">
            {e.action}
          </Badge>
        </span>
      ),
    },
    { id: "summary", header: "Details", cell: (e) => <span className="text-text-2">{e.summary ?? ""}</span>, className: "min-w-48" },
    { id: "actor", header: "By", cell: (e) => <span className="text-text">{e.actorEmail}</span>, className: "hidden md:table-cell" },
    ...(showTarget
      ? [
          {
            id: "target",
            header: "On",
            cell: (e: AuditEntry) =>
              e.targetType && e.targetId ? (
                TARGET_HREF[e.targetType] ? (
                  <Link href={TARGET_HREF[e.targetType](e.targetId)} onClick={(ev) => ev.stopPropagation()} className="font-mono text-xs text-primary hover:underline">
                    {e.targetType}:{e.targetId.slice(-8)}
                  </Link>
                ) : (
                  <span className="font-mono text-xs text-muted">
                    {e.targetType}:{e.targetId.slice(-8)}
                  </span>
                )
              ) : (
                <span className="text-muted">—</span>
              ),
            className: "hidden lg:table-cell",
          } satisfies Column<AuditEntry>,
        ]
      : []),
    { id: "at", header: "When", cell: (e) => <Time iso={e.createdAt} className="text-text-2" /> },
  ];

  const expanded = rows.find((r) => r.id === open);
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onRowClick={(e) => setOpen((o) => (o === e.id ? null : e.id))}
        empty={{ icon: FileClock, title: "No actions recorded" }}
        toolbar={toolbar}
      />
      {expanded && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-card">
          <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>IP {expanded.ip ?? "—"}</span>
            <span className="max-w-md truncate">{expanded.userAgent ?? ""}</span>
            {expanded.requestId && <span className="font-mono">req {expanded.requestId}</span>}
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-text-2">{expanded.data ? JSON.stringify(expanded.data, null, 2) : "No request data"}</pre>
        </div>
      )}
    </>
  );
}
