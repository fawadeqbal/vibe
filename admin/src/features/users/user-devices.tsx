"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { EmptyState } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";

import { userKeys } from "./api";

/** One device this person is signed in on (GET /admin/users/:id/sessions). */
export interface DeviceSession {
  id: string;
  client: "android" | "ios" | "web";
  device: string;
  signedInAt: string;
  lastActiveAt: string;
  ip: string | null;
  userAgent: string | null;
}

const KIND: Record<DeviceSession["client"], string> = { android: "Android app", ios: "iPhone app", web: "Website" };

/**
 * The user page's Devices tab: every phone and browser they're signed in on,
 * with IP and browser details. Signing one (or every) device out ends it at
 * once and is written to the history with the reason.
 */
export function DevicesTab({ userId, canManage }: { userId: string; canManage: boolean }) {
  const key = userKeys.sub(userId, "sessions");
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<DeviceSession[]>(`admin/users/${userId}/sessions`, undefined, signal) });
  const [ending, setEnding] = React.useState<DeviceSession | "all" | null>(null);
  if (q.isLoading) return <Skeleton className="h-28" />;
  if (q.error) return <EmptyState title="Couldn’t load devices" description="Try again in a moment." />;
  const rows = q.data ?? [];
  return (
    <div className="space-y-3">
      {!rows.length ? (
        <EmptyState title="Not signed in anywhere" description="They’ll appear here the next time they sign in on a phone or browser." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-text">
                  {d.device}
                  <Badge tone={d.client === "web" ? "info" : "ok"}>{KIND[d.client]}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-text-2">
                  Last used <Time iso={d.lastActiveAt} /> · signed in <Time iso={d.signedInAt} mode="date" />
                  {d.ip ? <> · IP <span className="font-mono">{d.ip}</span></> : null}
                </p>
                {d.userAgent ? <p className="mt-0.5 truncate font-mono text-[11px] text-muted" title={d.userAgent}>{d.userAgent}</p> : null}
              </div>
              {canManage ? (
                <Button variant="secondary" size="sm" onClick={() => setEnding(d)}>
                  Sign out
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage && rows.length > 1 ? (
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={() => setEnding("all")}>
            Sign out everywhere
          </Button>
        </div>
      ) : null}
      <EndDialog userId={userId} target={ending} onClose={() => setEnding(null)} />
    </div>
  );
}

function EndDialog({ userId, target, onClose }: { userId: string; target: DeviceSession | "all" | null; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  const all = target === "all";
  const end = useAction(
    () => (all ? api.post(`admin/users/${userId}/sessions/sign-out-all`, { reason }) : api.delete(`admin/users/${userId}/sessions/${(target as DeviceSession).id}`, { reason })),
    {
      success: all ? "Signed out everywhere" : "Device signed out",
      invalidate: [userKeys.sub(userId, "sessions"), userKeys.sub(userId, "audit")],
      onSuccess: () => {
        setReason("");
        onClose();
      },
    },
  );
  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={all ? "Sign out every device?" : `Sign out ${target ? target.device : ""}?`} description="They go back to the sign-in screen right away and can sign in again. Your reason goes in the account history.">
        <Field label="Reason" hint="At least 3 characters">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reported a lost phone" maxLength={200} autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={end.isPending} disabled={reason.trim().length < 3} onClick={() => end.mutate()}>
            Sign out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
