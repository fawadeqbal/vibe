"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { Time, UserCell } from "@/components/common/bits";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { Page, PhotoFlag } from "@/lib/api/types";
import { P } from "@/lib/permissions";

export const photoFlagKeys = {
  all: ["photo-flags"] as const,
  list: (q: Query) => ["photo-flags", "list", q] as const,
  open: ["photo-flags", "open"] as const,
};

export function usePhotoFlags(q: Query) {
  return useCursorQuery<PhotoFlag>(photoFlagKeys.list(q), (cursor, signal) => api.get<Page<PhotoFlag>>("admin/photo-flags", { ...q, cursor, limit: 30 }, signal));
}

/** Photos nobody has looked at yet (the Reports tab badge). */
/** Older photos still waiting for their first check (the sweeper works through them, ~20 a minute). */
export function usePhotoBacklog() {
  return useQuery({
    queryKey: ["photo-flags", "backlog"],
    queryFn: ({ signal }) => api.get<{ backlog?: { avatars: number; moments: number } }>("admin/photo-flags", { limit: 1 }, signal).then((r) => r.backlog ?? { avatars: 0, moments: 0 }),
    refetchInterval: 60_000,
  });
}

export function useOpenPhotoFlags() {
  return useQuery({ queryKey: photoFlagKeys.open, queryFn: ({ signal }) => api.get<Page<PhotoFlag> & { open: number }>("admin/photo-flags", { status: "open", limit: 1 }, signal).then((r) => r.open), refetchInterval: 60_000 });
}

const PLACE: Record<PhotoFlag["place"], string> = { chat: "Chat photo", moment: "Moment", avatar: "Profile photo", selfie: "Verification selfie" };

/**
 * Photos the nudity filter blocked (never sent; a private copy is kept 30
 * days as evidence) or let through as borderline. Images load only when a
 * moderator asks, start blurred, and every view is written to the audit log.
 */
export function PhotoFlagsTable({ userId }: { userId?: string }) {
  const can = useCan();
  const [status, setStatus] = React.useState<"open" | "all">(userId ? "all" : "open");
  const [action, setAction] = React.useState<"" | "blocked" | "review">("");
  const backlog = usePhotoBacklog();
  const q = usePhotoFlags({ ...(userId ? { userId } : {}), status, ...(action ? { action } : {}) });
  const done = useAction((id: string) => api.post(`admin/photo-flags/${id}/reviewed`), { success: "Marked as reviewed", invalidate: [photoFlagKeys.all] });

  const columns: Column<PhotoFlag>[] = [
    { id: "photo", header: "Photo", cell: (f) => (f.hasImage ? <FlagImage id={f.id} /> : <span className="text-xs text-muted">Not kept</span>), className: "w-28" },
    ...(userId ? [] : [{ id: "who", header: "Sent by", cell: (f: PhotoFlag) => <UserCell user={f.user} size={26} sub={f.user.bannedUntil ? "Paused" : undefined} />, className: "min-w-44" }]),
    {
      id: "what",
      header: "What happened",
      cell: (f) => (
        <div className="space-y-1">
          <Badge tone={f.action === "blocked" ? "bad" : "warn"}>{f.action === "blocked" ? "Blocked · not sent" : "Sent · borderline"}</Badge>
          <p className="text-xs text-muted">{PLACE[f.place]}</p>
        </div>
      ),
    },
    { id: "score", header: "Nudity score", cell: (f) => <span className="tabular">{Math.round(f.score * 100)}%</span>, align: "right" },
    { id: "at", header: "When", cell: (f) => <Time iso={f.createdAt} className="text-text-2" />, className: "hidden md:table-cell" },
    {
      id: "reviewed",
      header: "",
      cell: (f) =>
        f.reviewedAt ? (
          <span className="text-xs text-muted">Reviewed</span>
        ) : can(P.ModerationResolve) ? (
          <Button size="xs" variant="secondary" disabled={done.isPending} onClick={() => done.mutate(f.id)}>
            <Check />
            Reviewed
          </Button>
        ) : null,
      align: "right",
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-2">
        Every chat photo, Moment, profile photo and verification selfie is checked for nudity. Blocked uploads never reach anyone; three in 30 days pause the account. Older profile photos and Moments are checked in the background and taken down if they show nudity. Borderline ones stay up and wait here for a look. Kept 30 days.
      </p>
      {backlog.data && backlog.data.avatars + backlog.data.moments > 0 ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          Still checking older photos: {backlog.data.avatars} profile photo{backlog.data.avatars === 1 ? "" : "s"} and {backlog.data.moments} Moment{backlog.data.moments === 1 ? "" : "s"} to go (about 20 a minute).
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Segmented value={status} onChange={setStatus} options={[{ value: "open", label: "To review" }, { value: "all", label: "All" }]} />
        <Segmented value={action} onChange={setAction} options={[{ value: "", label: "Any" }, { value: "blocked", label: "Blocked" }, { value: "review", label: "Borderline" }]} />
      </div>
      <DataTable
        columns={columns}
        rows={q.rows}
        getRowId={(f) => f.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={q.refetch}
        hasMore={q.hasNextPage}
        loadingMore={q.isFetchingNextPage}
        onLoadMore={q.fetchNextPage}
        empty={{ title: status === "open" ? "Nothing to review" : "No flagged photos", description: "Photos the nudity filter blocks or finds borderline show up here." }}
      />
    </div>
  );
}

/** Loaded with the staff session only when asked, shown blurred until "Show". */
function FlagImage({ id }: { id: string }) {
  const [want, setWant] = React.useState(false);
  const [clear, setClear] = React.useState(false);
  const [state, setState] = React.useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  React.useEffect(() => {
    if (!want) return;
    const ctrl = new AbortController();
    let url: string | null = null;
    api.blob(`admin/photo-flags/${id}/image`, undefined, ctrl.signal).then(
      ({ blob }) => {
        url = URL.createObjectURL(blob);
        setState({ url, error: null });
      },
      (e: unknown) => {
        if (!ctrl.signal.aborted) setState({ url: null, error: (e as Error).message || "Couldn't load it" });
      },
    );
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, want]);

  if (!want)
    return (
      <Button size="xs" variant="ghost" onClick={() => setWant(true)}>
        <Eye />
        Load
      </Button>
    );
  if (state.error) return <span className="text-xs text-bad">{state.error}</span>;
  if (!state.url) return <Skeleton className="size-20 rounded-lg" />;
  return (
    <button type="button" onClick={() => setClear((c) => !c)} className="group relative block size-20 overflow-hidden rounded-lg border border-line" title={clear ? "Blur again" : "Show"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL; next/image can't load it */}
      <img src={state.url} alt="Flagged photo" className={clear ? "size-full object-cover" : "size-full scale-110 object-cover blur-xl"} />
      <span className="absolute inset-0 grid place-items-center text-white opacity-80 group-hover:opacity-100">{clear ? null : <EyeOff className="size-5 drop-shadow" />}</span>
    </button>
  );
}
