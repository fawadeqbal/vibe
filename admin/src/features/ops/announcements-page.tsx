"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Megaphone, Pencil, Plus, Send } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented, Skeleton } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { Announcement, AnnouncementAudience } from "@/lib/api/types";
import { format } from "@/lib/format";

const key = (status: string) => ["ops", "announcements", status] as const;

export function AnnouncementsPage() {
  const [status, setStatus] = React.useState<"" | "DRAFT" | "LIVE" | "ARCHIVED">("");
  const [editing, setEditing] = React.useState<Announcement | "new" | null>(null);
  const q = useQuery({ queryKey: key(status), queryFn: ({ signal }) => api.get<Announcement[]>("admin/announcements", { status }, signal) });
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["ops", "announcements"] });

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Short messages shown in the app. Publishing pushes it to everyone online at once and shows it to others when they next open Vibe."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus /> New announcement
          </Button>
        }
      />
      <Segmented
        value={status}
        onChange={setStatus}
        className="mb-4"
        options={[
          { value: "", label: "All" },
          { value: "LIVE", label: "Live" },
          { value: "DRAFT", label: "Drafts" },
          { value: "ARCHIVED", label: "Archived" },
        ]}
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-48" />
      ) : !q.data?.length ? (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements" description="Write one to tell people about new features, events or downtime." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((a) => (
            <Card key={a.id} className="flex flex-col p-4">
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={a.status} />
                <Badge tone="outline">{a.audience === "ALL" ? "Everyone" : format.enum(a.audience)}</Badge>
                <span className="ml-auto text-xs text-muted">{a.publishedAt ? <>Published <Time iso={a.publishedAt} /></> : <>Created <Time iso={a.createdAt} /></>}</span>
              </div>
              <h3 className="font-semibold text-text">{a.title}</h3>
              <p className="mt-1 flex-1 text-sm whitespace-pre-wrap text-text-2">{a.body}</p>
              {a.expiresAt && <p className="mt-2 text-xs text-muted">Ends {format.dateTime(a.expiresAt)}</p>}
              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                {a.status === "DRAFT" && (
                  <>
                    <Button size="sm" onClick={() => setEditing(a)}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        void confirm({
                          title: "Publish now?",
                          description: a.audience === "ALL" ? "Everyone online sees it immediately. It can't be edited after." : "It's shown to the chosen audience when they open the app.",
                          confirmLabel: "Publish",
                          action: async () => {
                            await api.post(`admin/announcements/${a.id}/publish`);
                            toast.success("Published");
                            await refresh();
                          },
                        })
                      }
                    >
                      <Send /> Publish
                    </Button>
                  </>
                )}
                {a.status !== "ARCHIVED" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() =>
                      void confirm({
                        title: "Archive this announcement?",
                        description: "It stops showing in the app.",
                        confirmLabel: "Archive",
                        action: async () => {
                          await api.post(`admin/announcements/${a.id}/archive`);
                          await refresh();
                        },
                      })
                    }
                  >
                    <Archive /> Archive
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <AnnouncementDialog initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AnnouncementDialog({ initial, onClose }: { initial: Announcement | null; onClose: () => void }) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [audience, setAudience] = React.useState<AnnouncementAudience>(initial?.audience ?? "ALL");
  const [expiresAt, setExpiresAt] = React.useState(initial?.expiresAt ? initial.expiresAt.slice(0, 16) : "");
  const save = useAction(
    () => {
      const payload = { title, body, audience, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : initial ? null : undefined };
      return initial ? api.patch(`admin/announcements/${initial.id}`, payload) : api.post("admin/announcements", payload);
    },
    { success: initial ? "Draft saved" : "Draft created", invalidate: [["ops", "announcements"]], onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={initial ? "Edit draft" : "New announcement"}
        description="Saved as a draft. Publish it from the list when it's ready."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={title.trim().length < 2 || body.trim().length < 2} onClick={() => save.mutate()}>
              Save draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" hint={`${title.length}/80`}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="New gifts are here" />
          </Field>
          <Field label="Message" hint={`${body.length}/500`}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={4} placeholder="Send a Rocket to someone who made your day." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who sees it">
              <NativeSelect value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
                <option value="ALL">Everyone</option>
                <option value="VIP">VIP only</option>
                <option value="NON_VIP">Not VIP</option>
              </NativeSelect>
            </Field>
            <Field label="Stop showing" optional>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
