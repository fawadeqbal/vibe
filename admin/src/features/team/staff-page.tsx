"use client";

import { Check, Copy, ShieldCheck, ShieldOff, UserCog, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Can, useMe } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Staff } from "@/lib/api/types";
import { P } from "@/lib/permissions";

import { teamKeys, useRoles, useStaff } from "./api";

export function StaffPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const [f, setF] = useUrlState({ q: "", status: "", roleId: "" });
  const staff = useStaff(f);
  const roles = useRoles();
  const [inviting, setInviting] = React.useState(false);

  const columns: Column<Staff>[] = [
    {
      id: "who",
      header: "Person",
      cell: (s) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={s.name} size={30} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">
              {s.name} {s.id === me?.id && <span className="text-xs font-normal text-muted">(you)</span>}
            </span>
            <span className="block truncate text-xs text-muted">{s.email}</span>
          </span>
        </span>
      ),
      className: "min-w-60",
    },
    { id: "role", header: "Role", cell: (s) => <Badge tone={s.role.key === "owner" ? "primary" : "neutral"}>{s.role.name}</Badge> },
    {
      id: "2fa",
      header: "2FA",
      cell: (s) =>
        s.twoFactorEnabled ? (
          <span className="inline-flex items-center gap-1 text-xs text-ok">
            <ShieldCheck className="size-3.5" /> On
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-warn">
            <ShieldOff className="size-3.5" /> Off
          </span>
        ),
    },
    { id: "status", header: "Status", cell: (s) => (s.mustChangePassword && s.status === "ACTIVE" ? <Badge tone="info">Invited</Badge> : <StatusBadge status={s.status} />) },
    { id: "seen", header: "Last sign-in", cell: (s) => <Time iso={s.lastLoginAt} className="text-text-2" />, className: "hidden md:table-cell" },
  ];

  return (
    <div>
      <PageHeader
        title="Staff"
        description="People who can use this panel. What each person can do comes from their role."
        actions={
          <Can permission={P.StaffManage}>
            <Button variant="primary" onClick={() => setInviting(true)}>
              <UserPlus /> Add person
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        rows={staff.data ?? []}
        getRowId={(s) => s.id}
        loading={staff.isLoading}
        error={staff.error}
        onRetry={() => void staff.refetch()}
        onRowClick={(s) => router.push(`/team/${s.id}`)}
        rowClassName={(s) => (s.status === "DISABLED" ? "opacity-60" : undefined)}
        empty={{ icon: UserCog, title: "No staff match" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Name or e-mail" />
            <FilterSelect label="Role" value={f.roleId} onChange={(roleId) => setF({ roleId })} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
            <FilterSelect label="Status" value={f.status} onChange={(status) => setF({ status })} options={[{ value: "ACTIVE", label: "Active" }, { value: "DISABLED", label: "Disabled" }]} />
          </FilterBar>
        }
      />
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const roles = useRoles();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [result, setResult] = React.useState<{ staff: Staff; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const defaultRole = roles.data?.find((r) => r.key === "viewer")?.id ?? roles.data?.[0]?.id ?? "";
  const role = roleId || defaultRole;
  const invite = useAction(() => api.post<{ staff: Staff; temporaryPassword: string }>("admin/staff", { email, name, roleId: role }), { invalidate: [teamKeys.all], onSuccess: (r) => setResult(r) });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {result ? (
        <DialogContent title={`${result.staff.name} is added`} description="Send them the panel address, their e-mail and this temporary password over a private channel. It's shown once; they choose their own at first sign-in." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-3">
            <code className="flex-1 font-mono text-base text-text">{result.temporaryPassword}</code>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(result.temporaryPassword);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Add a person"
          description="They get a temporary password and must change it (and set up 2FA if required) when they first sign in."
          footer={
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" loading={invite.isPending} disabled={!email.includes("@") || name.trim().length < 2 || !role} onClick={() => invite.mutate()}>
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
            </Field>
            <Field label="Work e-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role" hint={roles.data?.find((r) => r.id === role)?.description}>
              <NativeSelect value={role} onChange={(e) => setRoleId(e.target.value)}>
                {(roles.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
