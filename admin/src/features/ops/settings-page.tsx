"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton, Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { meKey } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { Setting } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const key = ["ops", "settings"] as const;

/** Settings that change risky behaviour ask for confirmation first. */
const CONFIRM: Record<string, (v: unknown) => string | null> = {
  "maintenance.enabled": (v) => (v ? "Everyone using the app is paused right now. Only staff can work." : null),
  "signups.enabled": (v) => (!v ? "New people can't create accounts until you turn this back on." : null),
  "matching.enabled": (v) => (!v ? "Nobody can start a new video match until you turn this back on." : null),
  "payouts.paused": (v) => (v ? "Every new cash-out waits for someone to approve it." : null),
  "security.require2fa": (v) => (v ? "Staff without two-factor must set it up before they can use the panel." : null),
};

/**
 * Runtime settings, rendered from the API's own list (type, label, help),
 * so a new setting on the server shows up here without frontend work.
 */
export function SettingsPage() {
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<Setting[]>("admin/settings", undefined, signal) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const groups = Object.entries(
    (q.data ?? []).reduce<Record<string, Setting[]>>((acc, s) => {
      (acc[s.group] ??= []).push(s);
      return acc;
    }, {}),
  );
  const maintenance = q.data?.find((s) => s.key === "maintenance.enabled")?.value === true;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Changes apply to every server within seconds and are recorded in the audit log." />
      {maintenance && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="size-4 shrink-0" />
          Maintenance mode is on — the app is paused for everyone.
        </div>
      )}
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-5">
          {groups.map(([group, items]) => (
            <Card key={group}>
              <CardHeader title={group} />
              <ul className="divide-y divide-line">
                {items.map((s) => (
                  <SettingRow key={s.key} setting={s} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingRow({ setting: s }: { setting: Setting }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = React.useState(String(s.value));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the draft when the server value changes
    setDraft(String(s.value));
  }, [s.value]);

  const save = async (value: unknown) => {
    const warning = CONFIRM[s.key]?.(value);
    if (warning && !(await confirm({ title: `${s.label}?`, description: warning, confirmLabel: "Yes, change it", tone: "danger" }))) return;
    setBusy(true);
    try {
      await api.put(`admin/settings/${s.key}`, { value });
      toast.success(`${s.label} updated`);
      await qc.invalidateQueries({ queryKey: key });
      if (s.key === "security.require2fa") await qc.invalidateQueries({ queryKey: meKey });
    } catch (e) {
      toast.error((e as Error).message);
      setDraft(String(s.value));
    } finally {
      setBusy(false);
    }
  };

  const changed = s.type !== "boolean" && draft !== String(s.value);
  const isDefault = String(s.value) === String(s.default);

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-text">
          {s.label}
          {!isDefault && <Badge tone="primary">Changed</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-muted">{s.description}</p>
        {s.updatedAt && (
          <p className="mt-1 text-[11px] text-muted">
            Last changed <Time iso={s.updatedAt} />
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {s.type === "boolean" ? (
          <Switch checked={s.value === true} disabled={busy} onCheckedChange={(v) => void save(v)} aria-label={s.label} />
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(s.type === "number" ? Number(draft) : draft);
            }}
          >
            <Input type={s.type === "number" ? "number" : "text"} value={draft} onChange={(e) => setDraft(e.target.value)} className={cn(s.type === "number" ? "w-28" : "w-64")} aria-label={s.label} />
            {changed && (
              <Button type="submit" size="sm" variant="primary" loading={busy}>
                Save
              </Button>
            )}
          </form>
        )}
        {!isDefault && (
          <Button size="icon-xs" variant="ghost" aria-label="Reset to default" title={`Default: ${String(s.default) || "empty"}`} onClick={() => void save(s.default)} disabled={busy}>
            <RotateCcw />
          </Button>
        )}
      </div>
    </li>
  );
}
