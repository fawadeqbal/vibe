"use client";

import { Bell, Mail, Plus, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Time } from "@/components/common/bits";
import { PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { useUrlState } from "@/hooks/use-url-state";
import type { Campaign } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useCampaigns } from "./api";

export function audienceLabel(c: Pick<Campaign, "audience" | "total" | "pickedCount">) {
  if (c.audience === "ALL") return "Everyone";
  if (c.audience === "SEGMENT") return "Filtered group";
  return `${format.number(c.pickedCount ?? c.total)} picked`;
}

export function Channels({ c }: { c: Pick<Campaign, "sendEmail" | "sendInApp" | "important"> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {c.sendEmail && (
        <Badge tone="outline">
          <Mail /> E-mail
        </Badge>
      )}
      {c.sendInApp && (
        <Badge tone="outline">
          <Bell /> In-app
        </Badge>
      )}
      {c.important && (
        <Badge tone="warn">
          <ShieldAlert /> Important
        </Badge>
      )}
    </span>
  );
}

export function Progress({ c, className }: { c: Pick<Campaign, "processed" | "total" | "status">; className?: string }) {
  const pct = c.total ? Math.round((c.processed / c.total) * 100) : 0;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className={cn("block h-full rounded-full", c.status === "FAILED" ? "bg-bad" : c.status === "CANCELED" ? "bg-muted" : "bg-primary")} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-xs text-text-2">
        {format.number(c.processed)}/{format.number(c.total)}
      </span>
    </span>
  );
}

const columns: Column<Campaign>[] = [
  {
    id: "name",
    header: "Message",
    cell: (c) => (
      <span className="block min-w-0">
        <span className="block truncate text-sm font-medium text-text">{c.name}</span>
        {c.subject !== c.name && <span className="block truncate text-xs text-muted">{c.subject}</span>}
      </span>
    ),
    className: "min-w-56 max-w-80",
  },
  {
    id: "channels",
    header: "Sent as",
    cell: (c) => <Channels c={c} />,
    className: "hidden md:table-cell",
  },
  {
    id: "audience",
    header: "To",
    cell: (c) => <span className="text-sm text-text-2">{audienceLabel(c)}</span>,
  },
  {
    id: "progress",
    header: "Progress",
    cell: (c) => <Progress c={c} />,
    className: "hidden sm:table-cell",
  },
  {
    id: "status",
    header: "Status",
    cell: (c) => <StatusBadge status={c.status} />,
  },
  {
    id: "by",
    header: "By",
    cell: (c) => <span className="text-sm text-text-2">{c.createdBy}</span>,
    className: "hidden lg:table-cell",
  },
  {
    id: "at",
    header: "Created",
    cell: (c) => <Time iso={c.createdAt} className="text-text-2" />,
  },
];

export function MessagesPage() {
  const router = useRouter();
  const [f, setF] = useUrlState({ status: "" });
  const list = useCampaigns({ status: f.status });

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Send an e-mail, an in-app message, or both — to one person, a filtered group, or everyone. Sending runs in the background; you can leave this page."
        actions={
          <Button variant="primary" asChild>
            <Link href="/messages/new">
              <Plus /> New message
            </Link>
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(c) => c.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        onRowClick={(c) => router.push(`/messages/${c.id}`)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{
          icon: Send,
          title: f.status ? "No messages with this status" : "No messages sent yet",
          description: f.status ? undefined : "Write one to reach people by e-mail or in the app.",
        }}
        toolbar={
          <FilterBar>
            <Segmented
              value={f.status}
              onChange={(status) => setF({ status })}
              options={[
                { value: "", label: "All" },
                { value: "SENDING", label: "Sending" },
                { value: "QUEUED", label: "Queued" },
                { value: "SENT", label: "Sent" },
                { value: "CANCELED", label: "Canceled" },
                { value: "FAILED", label: "Failed" },
              ]}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
