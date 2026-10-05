"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ImageOff, ScanFace, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useAction } from "@/hooks/use-action";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Verification } from "@/lib/api/types";
import { flag, format } from "@/lib/format";

import { userKeys, useVerifications, verificationKeys } from "./api";

const TABS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const similarityTone = (s: number): Tone => (s >= 90 ? "ok" : s >= 70 ? "warn" : "bad");

export function SimilarityBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  return <Badge tone={similarityTone(value)}>{Math.round(value)}% match</Badge>;
}

const decidedColumns: Column<Verification>[] = [
  { id: "user", header: "User", cell: (v) => <UserCell user={v.user} size={26} />, className: "min-w-44" },
  { id: "status", header: "Status", cell: (v) => <StatusBadge status={v.status} /> },
  { id: "similarity", header: "Match", cell: (v) => <SimilarityBadge value={v.similarity} />, className: "hidden sm:table-cell" },
  { id: "provider", header: "Checked by", cell: (v) => <span className="text-text-2">{format.enum(v.provider)}</span>, className: "hidden md:table-cell" },
  { id: "reason", header: "Reason", cell: (v) => <span className="text-xs text-muted">{v.reason ?? ""}</span>, className: "hidden lg:table-cell max-w-64 truncate" },
  { id: "at", header: "Submitted", cell: (v) => <Time iso={v.createdAt} className="text-text-2" /> },
];

/** Selfie checks waiting for a person: compare the selfie with the profile photo, approve or reject. */
export function VerificationsPage() {
  const [f, setF] = useUrlState({ status: "PENDING" });
  const q = useVerifications(f.status);
  const pending = f.status === "PENDING";

  return (
    <div>
      <PageHeader title="Verifications" description="Selfies the automatic check couldn't decide. Approve when the selfie is clearly the person in the profile photo; approving gives them the verified badge." />
      <Tabs value={f.status} onValueChange={(status) => setF({ status })}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} count={t.value === f.status && q.data ? q.data.length : undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {pending ? (
        q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        ) : !q.data?.length ? (
          <Card>
            <EmptyState icon={ScanFace} title="Nothing waiting" description="New selfies that need a person show up here." />
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {q.data.map((v) => (
              <PendingCard key={v.id} v={v} />
            ))}
          </div>
        )
      ) : (
        <DataTable
          columns={decidedColumns}
          rows={q.data ?? []}
          getRowId={(v) => v.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          empty={{ icon: ScanFace, title: f.status === "APPROVED" ? "No approved selfies" : "No rejected selfies" }}
        />
      )}
      {!pending && q.data?.length === 100 && <p className="mt-2 text-xs text-muted">Showing the oldest 100.</p>}
    </div>
  );
}

function PendingCard({ v }: { v: Verification }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const invalidate = [verificationKeys.all, userKeys.detail(v.user.id), userKeys.lists()];
  const approve = useAction(() => api.post(`admin/verifications/${v.id}/approve`), { success: `${v.user.name || "User"} is verified`, invalidate });

  return (
    <Card className="flex flex-col p-4" data-verification={v.id}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <UserCell user={v.user} sub={[v.user.age ? `${v.user.age}` : null, v.user.countryCode ? `${flag(v.user.countryCode)} ${v.user.countryCode}` : null].filter(Boolean).join(" · ")} />
        <span className="shrink-0 text-xs text-muted">
          <Time iso={v.createdAt} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Photo label="Profile photo">
          {v.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- photos live on the media host, sized by CSS; not worth the image optimizer
            <img src={v.user.avatarUrl} alt={`${v.user.name}'s profile photo`} className="size-full object-cover" />
          ) : (
            <NoImage text="No profile photo" />
          )}
        </Photo>
        <Photo label="Selfie">{v.hasSelfie ? <Selfie id={v.id} name={v.user.name} /> : <NoImage text="Selfie not kept" />}</Photo>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        {v.similarity != null && <SimilarityBadge value={v.similarity} />}
        <Badge tone="outline">Checked by {format.enum(v.provider)}</Badge>
        {v.reason && <span className="text-muted">{v.reason}</span>}
      </div>
      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <Button
          variant="danger-ghost"
          onClick={() =>
            void confirm({
              title: v.user.name ? `Reject ${v.user.name}'s selfie?` : "Reject this selfie?",
              description: "They stay unverified and can try again with a new selfie.",
              confirmLabel: "Reject",
              tone: "danger",
              reason: { label: "Reason (the user may see this)", placeholder: "e.g. Face not visible, not the same person" },
              action: async ({ reason }) => {
                await api.post(`admin/verifications/${v.id}/reject`, { reason });
                toast.success("Rejected");
                await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
              },
            })
          }
        >
          <X /> Reject
        </Button>
        <Button variant="trust" className="ml-auto" loading={approve.isPending} onClick={() => approve.mutate()}>
          <Check /> Approve
        </Button>
      </div>
    </Card>
  );
}

function Photo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="min-w-0">
      <div className="aspect-[3/4] overflow-hidden rounded-lg border border-line bg-surface-2">{children}</div>
      <figcaption className="mt-1 text-center text-[11px] text-muted">{label}</figcaption>
    </figure>
  );
}

function NoImage({ text }: { text: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted">
      <ImageOff className="size-5" />
      {text}
    </div>
  );
}

/** The selfie is private: fetched with the staff session as a blob, shown from an object URL. */
function Selfie({ id, name }: { id: string; name: string }) {
  const s = useSelfieUrl(id);
  if (s.error) return <NoImage text={s.error} />;
  if (!s.url) return <Skeleton className="size-full rounded-none" />;
  // eslint-disable-next-line @next/next/no-img-element -- a blob: URL; next/image can't load it
  return <img src={s.url} alt={`${name}'s selfie`} className="size-full object-cover" />;
}

function useSelfieUrl(id: string) {
  const [state, setState] = React.useState<{ id: string; url: string | null; error: string | null } | null>(null);
  React.useEffect(() => {
    const ctrl = new AbortController();
    let url: string | null = null;
    api.blob(`admin/verifications/${id}/selfie`, undefined, ctrl.signal).then(
      ({ blob }) => {
        url = URL.createObjectURL(blob);
        setState({ id, url, error: null });
      },
      (e: unknown) => {
        if (!ctrl.signal.aborted) setState({ id, url: null, error: (e as Error).message || "Couldn't load the selfie" });
      },
    );
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  const current = state?.id === id ? state : null;
  return { url: current?.url ?? null, error: current?.error ?? null };
}
