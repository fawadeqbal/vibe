"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { toast } from "sonner";

import { Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useUrlState } from "@/hooks/use-url-state";
import { useCan } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import { P } from "@/lib/permissions";

export interface Appeal {
  id: string;
  status: "OPEN" | "ACCEPTED" | "REJECTED";
  message: string;
  bannedUntil: string;
  createdAt: string;
  resolvedAt: string | null;
  staffNote: string | null;
  user: { id: string; name: string; avatarUrl: string; bannedUntil: string | null; reports: number };
}

const TABS = [
  { value: "OPEN", label: "Waiting" },
  { value: "ACCEPTED", label: "Lifted" },
  { value: "REJECTED", label: "Kept" },
];

export const appealKeys = { all: ["appeals"] as const, list: (status: string) => ["appeals", status] as const };

/** "This is a mistake" messages from paused people: read, then lift the pause or keep it. */
export function AppealsPage() {
  const [f, setF] = useUrlState({ status: "OPEN" });
  const q = useQuery({
    queryKey: appealKeys.list(f.status),
    queryFn: ({ signal }) => api.get<{ items: Appeal[] }>("admin/appeals", { status: f.status, limit: "100" }, signal),
    refetchInterval: f.status === "OPEN" ? 30_000 : undefined,
  });
  const items = q.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Appeals" description="People whose matching is paused after reports, telling us it was a mistake. Lifting the pause lets them match again straight away; either way they get a reply." />
      <Tabs value={f.status} onValueChange={(status) => setF({ status })}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} count={t.value === f.status && q.data ? items.length : undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState icon={MessageSquareWarning} title={f.status === "OPEN" ? "No appeals waiting" : "Nothing here yet"} description="New appeals from paused people show up here." />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((a) => (
            <AppealCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppealCard({ a }: { a: Appeal }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const can = useCan();
  const done = () => qc.invalidateQueries({ queryKey: appealKeys.all });
  const answer = (action: "accept" | "reject") =>
    void confirm({
      title: action === "accept" ? `Lift ${a.user.name || "this person"}'s pause?` : "Keep the pause?",
      description: action === "accept" ? "They can match again right away and get a message that the pause was lifted." : "The pause stays until it runs out. They're told we looked again.",
      confirmLabel: action === "accept" ? "Lift the pause" : "Keep it",
      tone: action === "accept" ? "primary" : "danger",
      reason: { label: "Note to them (optional)", placeholder: action === "accept" ? "e.g. Sorry about that — the reports didn't hold up." : "e.g. Several people reported the same thing." },
      action: async ({ reason }) => {
        await api.post(`admin/appeals/${a.id}/resolve`, { action, note: reason || undefined });
        toast.success(action === "accept" ? "Pause lifted" : "Pause kept");
        await done();
      },
    });
  return (
    <Card className="flex flex-col p-4" data-appeal={a.id}>
      <div className="flex items-start justify-between gap-3">
        <UserCell user={a.user} sub={a.user.bannedUntil ? `Paused until ${new Date(a.user.bannedUntil).toLocaleString()}` : "Not paused now"} />
        <span className="shrink-0 text-xs text-muted">
          <Time iso={a.createdAt} />
        </span>
      </div>
      <blockquote className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm whitespace-pre-wrap">{a.message}</blockquote>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone={a.user.reports >= 3 ? "bad" : "warn"}>{a.user.reports} reports in total</Badge>
        {a.staffNote && <span className="text-muted">Note: {a.staffNote}</span>}
      </div>
      {a.status === "OPEN" && can(P.ModerationResolve) && (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          <Button variant="danger-ghost" onClick={() => answer("reject")}>
            <X /> Keep the pause
          </Button>
          <Button variant="trust" className="ml-auto" onClick={() => answer("accept")}>
            <Check /> Lift the pause
          </Button>
        </div>
      )}
    </Card>
  );
}
