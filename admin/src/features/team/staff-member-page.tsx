"use client";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldOff, UserCheck, UserX } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, ErrorState, PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, Skeleton } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/input";
import { describeAgent } from "@/features/account/security";
import { AuditTable } from "@/features/audit/audit-table";
import { useCan, useMe } from "@/features/auth/session";
import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api } from "@/lib/api/client";
import type { AuditEntry, Page, Staff } from "@/lib/api/types";
import { P } from "@/lib/permissions";

import { teamKeys, useRoles, useStaffMember } from "./api";

export function StaffMemberPage({ id }: { id: string }) {
  const q = useStaffMember(id);
  const can = useCan();
  const { data: me } = useMe();
  const actions = useCursorQuery<AuditEntry>(["team", "member", id, "actions"], (cursor, signal) => api.get<Page<AuditEntry>>("admin/audit", { actorId: id, cursor, limit: 20 }, signal), { enabled: can(P.AuditView) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const s = q.data;
  const self = s.id === me?.id;

  return (
    <div>
      <PageHeader
        back={{ href: "/team", label: "Staff" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={s.name} size={40} />
            <span>
              {s.name}
              <span className="block text-sm font-normal text-muted">{s.email}</span>
            </span>
          </span>
        }
        actions={can(P.StaffManage) && !self ? <MemberActions s={s} /> : undefined}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-text">What they did</h2>
          {can(P.AuditView) ? (
            <AuditTable rows={actions.rows} loading={actions.isLoading} error={actions.error} onRetry={actions.refetch} hasMore={actions.hasNextPage} loadingMore={actions.isFetchingNextPage} onLoadMore={actions.fetchNextPage} />
          ) : (
            <p className="text-sm text-muted">Seeing someone&apos;s actions needs the audit log permission.</p>
          )}
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Access" />
            <CardBody>
              <DescriptionList
                columns={1}
                items={[
                  { label: "Role", value: <Badge tone="primary">{s.role.name}</Badge> },
                  { label: "Status", value: <StatusBadge status={s.status} /> },
                  { label: "Two-factor", value: s.twoFactorEnabled ? <Badge tone="ok">On</Badge> : <Badge tone="warn">Off</Badge> },
                  { label: "Password", value: s.mustChangePassword ? "Temporary — not changed yet" : "Set by them" },
                  { label: "Last sign-in", value: <Time iso={s.lastLoginAt} /> },
                  { label: "Added", value: <Time iso={s.createdAt} mode="date" /> },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Signed in on" />
            <CardBody className="py-1">
              {!s.sessions?.length ? (
                <p className="py-3 text-sm text-muted">No active sessions.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {s.sessions.map((x) => (
                    <li key={x.id} className="py-2.5">
                      <p className="text-sm text-text">{describeAgent(x.userAgent)}</p>
                      <p className="text-xs text-muted">
                        {x.ip ?? "unknown IP"} · <Time iso={x.signedInAt} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MemberActions({ s }: { s: Staff }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: teamKeys.all });
  const run = (title: string, description: string, call: () => Promise<unknown>, opts: { danger?: boolean; label: string }) =>
    void confirm({
      title,
      description,
      confirmLabel: opts.label,
      tone: opts.danger ? "danger" : "primary",
      action: async () => {
        await call();
        await refresh();
      },
    });

  return (
    <>
      <Button onClick={() => setRoleOpen(true)}>Change role</Button>
      <Button
        onClick={() =>
          void confirm({
            title: `Reset ${s.name}'s password?`,
            description: "They're signed out and get a new temporary password to change at next sign-in.",
            confirmLabel: "Reset password",
            action: async () => {
              const r = await api.post<{ temporaryPassword: string }>(`admin/staff/${s.id}/reset-password`);
              setPassword(r.temporaryPassword);
              await refresh();
            },
          })
        }
      >
        <KeyRound /> Reset password
      </Button>
      {s.twoFactorEnabled && (
        <Button onClick={() => run(`Reset ${s.name}'s two-factor?`, "For a lost phone. They're signed out and set up 2FA again.", () => api.post(`admin/staff/${s.id}/reset-2fa`), { label: "Reset 2FA" })}>
          <ShieldOff /> Reset 2FA
        </Button>
      )}
      <Button variant="ghost" onClick={() => run(`Sign ${s.name} out everywhere?`, "Every browser they use is signed out.", () => api.post(`admin/staff/${s.id}/sign-out`), { label: "Sign out" })}>
        <LogOut /> Sign out
      </Button>
      {s.status === "ACTIVE" ? (
        <Button variant="danger-ghost" onClick={() => run(`Disable ${s.name}?`, "They're signed out at once and can't sign in. Their history stays.", () => api.patch(`admin/staff/${s.id}`, { status: "DISABLED" }), { danger: true, label: "Disable" })}>
          <UserX /> Disable
        </Button>
      ) : (
        <Button onClick={() => run(`Enable ${s.name}?`, "They can sign in again.", () => api.patch(`admin/staff/${s.id}`, { status: "ACTIVE" }), { label: "Enable" })}>
          <UserCheck /> Enable
        </Button>
      )}
      {roleOpen && <RoleDialog s={s} onClose={() => setRoleOpen(false)} />}
      {password && (
        <Dialog open onOpenChange={() => setPassword(null)}>
          <DialogContent size="sm" title="New temporary password" description="Shown once. Share it privately." footer={<Button variant="primary" onClick={() => setPassword(null)}>Done</Button>}>
            <code className="block rounded-lg bg-surface-2 p-3 font-mono text-base text-text">{password}</code>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function RoleDialog({ s, onClose }: { s: Staff; onClose: () => void }) {
  const roles = useRoles();
  const qc = useQueryClient();
  const [roleId, setRoleId] = React.useState(s.role.id);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`admin/staff/${s.id}`, { roleId });
      toast.success("Role changed — it applies right away");
      await qc.invalidateQueries({ queryKey: teamKeys.all });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={`Change ${s.name}'s role`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={roleId === s.role.id} onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Role" hint={roles.data?.find((r) => r.id === roleId)?.description}>
          <NativeSelect value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </DialogContent>
    </Dialog>
  );
}
