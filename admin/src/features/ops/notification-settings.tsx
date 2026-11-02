"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, Mail, Zap } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton, Switch, Tooltip } from "@/components/ui/controls";
import { api, ApiError } from "@/lib/api/client";
import { format } from "@/lib/format";

type Channel = "push" | "inApp" | "email";
type Switches = Record<Channel, boolean>;

interface NotificationsView {
  groups: { key: string; label: string }[];
  types: { key: string; group: string; label: string; auto: boolean; defaults: Switches; channels: Switches; sentLast7Days: Record<Channel, number> }[];
}

const key = ["config", "notifications"] as const;
const CHANNELS: { key: Channel; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: "push", label: "Phone", icon: <Bell className="size-3.5" />, hint: "Push notification on the phone (not while the app is open)" },
  { key: "inApp", label: "Inbox", icon: <Inbox className="size-3.5" />, hint: "A message in Chats → Messages from Vibe" },
  { key: "email", label: "E-mail", icon: <Mail className="size-3.5" />, hint: "Money and account e-mails always go. Others only reach people without the app, once a day, with e-mail updates on." },
];

/** Admin → Configuration → Notifications: every notification Vibe sends, and on which channels. */
export function NotificationSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<NotificationsView>("admin/config/notifications", undefined, signal) });
  const v = q.data;

  const save = useMutation({
    mutationFn: ({ type, channel, on }: { type: string; channel: Channel; on: boolean }) => api.put<NotificationsView>(`admin/config/notifications/${encodeURIComponent(type)}`, { [channel]: on }),
    onSuccess: (r, x) => {
      qc.setQueryData(key, r);
      toast.success(`${CHANNELS.find((c) => c.key === x.channel)?.label} ${x.on ? "on" : "off"} for “${r.types.find((t) => t.key === x.type)?.label}”`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
    meta: { silent: true },
  });

  return (
    <Card>
      <CardHeader
        title="Notifications"
        description="Everything Vibe tells people, in one list. Pick the channels for each one. People can also turn groups off themselves in Me → Notifications (account alerts always go). Numbers are what went out in the last 7 days."
      />
      <CardBody className="space-y-5">
        {!v ? (
          <Skeleton className="h-64" />
        ) : (
          v.groups.map((g) => {
            const types = v.types.filter((t) => t.group === g.key);
            if (!types.length) return null;
            return (
              <div key={g.key}>
                <div className="mb-1.5 grid grid-cols-[1fr_repeat(3,72px)] items-end gap-2 px-1 text-xs font-medium text-muted">
                  <span className="text-sm font-semibold">{g.label}</span>
                  {CHANNELS.map((c) => (
                    <Tooltip key={c.key} content={c.hint}>
                      <span className="flex items-center justify-center gap-1">
                        {c.icon}
                        {c.label}
                      </span>
                    </Tooltip>
                  ))}
                </div>
                <div className="divide-y divide-line rounded-lg border border-line">
                  {types.map((t) => (
                    <div key={t.key} className="grid grid-cols-[1fr_repeat(3,72px)] items-center gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate text-sm">
                          {t.label}
                          {t.auto ? (
                            <Tooltip content="Sent by itself when it happens">
                              <Zap className="size-3 shrink-0 text-muted" />
                            </Tooltip>
                          ) : null}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted">{t.key}</div>
                      </div>
                      {CHANNELS.map((c) => (
                        <div key={c.key} className="flex flex-col items-center gap-0.5">
                          <Switch
                            checked={t.channels[c.key]}
                            disabled={save.isPending}
                            aria-label={`${c.label}: ${t.label}`}
                            onCheckedChange={(on) => save.mutate({ type: t.key, channel: c.key, on })}
                          />
                          <span className="text-[11px] tabular-nums text-muted">{t.sentLast7Days[c.key] ? format.number(t.sentLast7Days[c.key]) : "–"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}
