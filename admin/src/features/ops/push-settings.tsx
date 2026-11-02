"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, FileKey2, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { format } from "@/lib/format";

interface PushView {
  source: "admin" | "none";
  mode: "live" | "dev" | "off";
  projectId: string | null;
  clientEmail: string | null;
  keySet: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  devices: { android: number; ios: number; web: number; total: number; activeLast30Days: number };
}

const key = ["config", "push"] as const;

/**
 * Admin → Configuration → Push notifications. The Firebase key is write-only:
 * pasted (or picked as a file) once, checked with Google, stored encrypted.
 */
export function PushSettings() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<PushView>("admin/config/push", undefined, signal) });
  const v = q.data;
  const [json, setJson] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [who, setWho] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const clear = () => {
    setJson("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const save = useMutation({
    mutationFn: () => api.put<PushView>("admin/config/push", { serviceAccountJson: json }),
    onSuccess: (r) => {
      clear();
      setError(null);
      qc.setQueryData(key, r);
      toast.success("Firebase key saved — push notifications are on");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save"),
    meta: { silent: true },
  });
  const test = useMutation({
    mutationFn: () => api.post<{ user: { name: string }; devices: number; delivered: number }>("admin/config/push/test", { user: who.trim() }),
    onSuccess: (r) =>
      r.devices === 0
        ? toast.error(`${r.user.name || "This person"} has no phone registered yet. They need the new app version, signed in, with notifications allowed.`)
        : r.delivered
          ? toast.success(`Sent to ${r.delivered} of ${r.devices} device${r.devices === 1 ? "" : "s"} of ${r.user.name || "this person"}`)
          : toast.error(`Firebase didn't accept any of ${r.user.name || "their"} ${r.devices} device${r.devices === 1 ? "" : "s"} (old or removed app).`),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send"),
    meta: { silent: true },
  });

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10_000) return setError("That file is too big to be a Firebase key.");
    setJson(await f.text());
    setFileName(f.name);
    setError(null);
  };

  return (
    <Card>
      <CardHeader
        title="Push notifications"
        description="Firebase Cloud Messaging sends notifications to phones. Paste the server key from Firebase → Project settings → Service accounts → Generate new private key."
        actions={
          v ? (
            v.mode === "live" ? (
              <Badge tone="ok" dot>
                Sending
              </Badge>
            ) : v.mode === "dev" ? (
              <Badge tone="warn">Test mode — nothing is sent</Badge>
            ) : (
              <Badge tone="bad">Off</Badge>
            )
          ) : null
        }
      />
      <CardBody className="space-y-5">
        {!v ? (
          <Skeleton className="h-48" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-xs text-muted">Firebase project</p>
                <p className="mt-0.5 truncate font-medium">{v.projectId ?? "—"}</p>
                {v.clientEmail ? <p className="truncate text-xs text-muted">{v.clientEmail}</p> : null}
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-xs text-muted">Phones that can get notifications</p>
                <p className="mt-0.5 font-medium tabular-nums">{format.number(v.devices.total)}</p>
                <p className="text-xs text-muted">
                  {format.number(v.devices.android)} Android · {format.number(v.devices.ios)} iPhone · {format.number(v.devices.activeLast30Days)} used in 30 days
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-xs text-muted">Key</p>
                {v.keySet ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                    <CheckCircle2 className="size-4 text-ok" /> Saved and hidden
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm font-medium text-bad">Not set</p>
                )}
                {v.updatedAt ? (
                  <p className="text-xs text-muted">
                    <Time iso={v.updatedAt} />
                    {v.updatedBy ? ` by ${v.updatedBy}` : ""}
                  </p>
                ) : null}
              </div>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (json.trim()) save.mutate();
              }}
            >
              <Field label={v.keySet ? "Replace the key" : "Firebase server key"} hint="Choose the .json file you downloaded, or paste everything inside it. It is checked with Google, stored encrypted, and never shown again.">
                <textarea
                  value={fileName ? `${fileName} — ready to save` : json}
                  onChange={(e) => {
                    setFileName(null);
                    setJson(e.target.value);
                  }}
                  readOnly={!!fileName}
                  rows={4}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder='{ "type": "service_account", "project_id": "…", … }'
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [-webkit-text-security:disc]"
                />
              </Field>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
              {error ? (
                <p role="alert" className="text-sm text-bad">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <FileKey2 /> Choose the .json file
                </Button>
                <Button type="submit" variant="primary" loading={save.isPending} disabled={!json.trim()}>
                  <Bell /> Check and save
                </Button>
                {json ? (
                  <Button type="button" variant="ghost" onClick={clear}>
                    Cancel
                  </Button>
                ) : null}
                {v.keySet && !json ? (
                  <Button
                    type="button"
                    variant="danger-ghost"
                    className="ml-auto"
                    onClick={() =>
                      void confirm({
                        title: "Turn push notifications off?",
                        description: "The saved Firebase key is deleted and no notifications are sent until you save a key again.",
                        confirmLabel: "Turn off",
                        tone: "danger",
                        action: async () => {
                          qc.setQueryData(key, await api.delete<PushView>("admin/config/push"));
                          toast.success("Push notifications are off");
                        },
                      })
                    }
                  >
                    <Trash2 /> Turn off
                  </Button>
                ) : null}
              </div>
            </form>

            <form
              className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (who.trim()) test.mutate();
              }}
            >
              <Field label="Send a test notification" hint="To every phone of one app user (yours, for example): their e-mail or user id." className="min-w-64 flex-1">
                <Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="you@gmail.com" autoComplete="off" />
              </Field>
              <Button type="submit" variant="secondary" loading={test.isPending} disabled={!who.trim() || v.mode === "off"}>
                <Send /> Send test
              </Button>
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}
