"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneOff, Radio, Search, Users, Video } from "lucide-react";
import * as React from "react";

import { Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { LiveState } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

const key = ["ops", "live"] as const;

/** Right now: who is online, who is waiting, and every live call. Polls every 5 s. */
export function LivePage() {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [auto, setAuto] = React.useState(true);
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<LiveState>("admin/live", { limit: 100 }, signal), refetchInterval: auto ? 5_000 : false });
  const s = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const columns: Column<LiveState["calls"][number]>[] = [
    { id: "a", header: "Person", cell: (c) => <UserCell user={c.a} size={28} />, className: "min-w-44" },
    { id: "b", header: "With", cell: (c) => <UserCell user={c.b} size={28} />, className: "min-w-44" },
    { id: "since", header: "Started", cell: (c) => <Time iso={c.startedAt} className="text-text-2" /> },
    { id: "coins", header: "Filters paid", cell: (c) => (c.coinsSpent ? `${c.coinsSpent} coins` : <span className="text-muted">—</span>), align: "right", className: "hidden md:table-cell" },
    ...(can(P.ModerationResolve)
      ? [
          {
            id: "end",
            header: "",
            align: "right" as const,
            cell: (c: LiveState["calls"][number]) => (
              <Button
                size="xs"
                variant="danger-ghost"
                onClick={() =>
                  void confirm({
                    title: "End this call?",
                    description: "Both people see the call end. Use it for safety problems — to remove someone, ban them instead.",
                    confirmLabel: "End call",
                    tone: "danger",
                    action: async () => {
                      await api.post(`admin/live/calls/${c.id}/end`);
                      await qc.invalidateQueries({ queryKey: key });
                    },
                  })
                }
              >
                <PhoneOff /> End
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live"
        description={s ? <>As of {format.time(s.at)}</> : "Real-time activity"}
        actions={
          <label className="flex items-center gap-2 text-sm text-text-2">
            <Switch checked={auto} onCheckedChange={setAuto} aria-label="Auto-refresh" />
            Auto-refresh
            {auto && (
              <Badge tone="ok" dot>
                Live
              </Badge>
            )}
          </label>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Online" icon={Users} tone="trust" loading={q.isLoading} value={format.number(s?.online)} hint="Apps connected right now" />
        <StatCard label="Searching" icon={Search} tone="primary" loading={q.isLoading} value={format.number(s?.searching)} hint="In the match queue" />
        <StatCard label="In calls" icon={Video} tone="money" loading={q.isLoading} value={format.number(s?.inCalls)} hint={s && `${format.number(s.inCalls * 2)} people talking`} />
      </div>
      <DataTable
        columns={columns}
        rows={s?.calls ?? []}
        getRowId={(c) => c.id}
        loading={q.isLoading}
        empty={{ icon: Radio, title: "No live calls right now" }}
      />
    </div>
  );
}
