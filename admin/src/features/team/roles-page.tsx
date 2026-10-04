"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import * as React from "react";

import { useConfirm } from "@/components/common/confirm";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Skeleton } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Can, useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { Role } from "@/lib/api/types";
import { P, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { teamKeys, usePermissionCatalog, useRoles } from "./api";

/** Roles and what they allow. Built-in roles are read-only; custom roles are fully editable. */
export function RolesPage() {
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<Role | "new" | null>(null);
  if (roles.error) return <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Roles"
        description="A role is a list of permissions. Changes apply to everyone in the role immediately."
        actions={
          <Can permission={P.RolesManage}>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus /> New role
            </Button>
          </Can>
        }
      />
      {!roles.data || !catalog.data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((r) => (
            <Card key={r.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-1.5 font-semibold text-text">
                    {r.system ? <Lock className="size-3.5 text-muted" /> : <ShieldCheck className="size-3.5 text-primary" />}
                    {r.name}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted">{r.description || "Custom role"}</p>
                </div>
                <Badge>{r.staffCount === 1 ? "1 person" : `${r.staffCount} people`}</Badge>
              </div>
              <div className="mt-3 flex flex-1 flex-wrap content-start gap-1">
                {r.allPermissions ? (
                  <Badge tone="primary">Everything</Badge>
                ) : (
                  catalog.data!.map((g) => {
                    const n = g.permissions.filter((p) => r.permissions.includes(p.key)).length;
                    return n ? (
                      <Badge key={g.key} tone="outline">
                        {g.label} {n < g.permissions.length && <span className="text-muted">{n}/{g.permissions.length}</span>}
                      </Badge>
                    ) : null;
                  })
                )}
              </div>
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={() => setEditing(r)}>
                  {r.system || !can(P.RolesManage) ? "View" : "Edit"}
                </Button>
                {!r.system && can(P.RolesManage) && (
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    className="ml-auto"
                    disabled={r.staffCount > 0}
                    title={r.staffCount > 0 ? "Move its people to another role first" : undefined}
                    onClick={() =>
                      void confirm({
                        title: `Delete the ${r.name} role?`,
                        confirmLabel: "Delete",
                        tone: "danger",
                        action: async () => {
                          await api.delete(`admin/roles/${r.id}`);
                          await qc.invalidateQueries({ queryKey: teamKeys.roles });
                        },
                      })
                    }
                  >
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <RoleEditor role={editing === "new" ? null : editing} readOnly={editing !== "new" && (editing.system || !can(P.RolesManage))} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoleEditor({ role, readOnly, onClose }: { role: Role | null; readOnly: boolean; onClose: () => void }) {
  const catalog = usePermissionCatalog();
  const [name, setName] = React.useState(role?.name ?? "");
  const [description, setDescription] = React.useState(role?.description ?? "");
  const [perms, setPerms] = React.useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const save = useAction(
    () => {
      const body = { name, description, permissions: [...perms] };
      return role ? api.patch(`admin/roles/${role.id}`, body) : api.post("admin/roles", body);
    },
    { success: role ? "Role saved — applies now" : "Role created", invalidate: [teamKeys.roles], onSuccess: onClose },
  );
  const toggle = (p: Permission, on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      if (on) n.add(p);
      else n.delete(p);
      return n;
    });
  const sensitive = catalog.data?.flatMap((g) => g.permissions).filter((p) => p.sensitive && perms.has(p.key)) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="lg"
        title={role ? (readOnly ? role.name : `Edit ${role.name}`) : "New role"}
        description={readOnly && role?.system ? "Built-in roles are defined in code and updated with each release." : "Give only what the job needs."}
        footer={
          readOnly ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" loading={save.isPending} disabled={name.trim().length < 2 || perms.size === 0} onClick={() => save.mutate()}>
                Save role
              </Button>
            </>
          )
        }
      >
        <div className="space-y-5">
          {!readOnly && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Community lead" />
              </Field>
              <Field label="Description" optional>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
              </Field>
            </div>
          )}
          {!catalog.data ? (
            <Skeleton className="h-60" />
          ) : (
            catalog.data.map((g) => {
              const all = g.permissions.every((p) => perms.has(p.key) || role?.allPermissions);
              return (
                <fieldset key={g.key} className="rounded-xl border border-line">
                  <legend className="sr-only">{g.label}</legend>
                  <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                    <span className="text-sm font-semibold text-text">{g.label}</span>
                    {!readOnly && (
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => g.permissions.forEach((p) => toggle(p.key, !all))}>
                        {all ? "Clear" : "Select all"}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-line">
                    {g.permissions.map((p) => {
                      const checked = role?.allPermissions || perms.has(p.key);
                      return (
                        <li key={p.key}>
                          <label className={cn("flex items-start gap-3 px-4 py-2.5", !readOnly && "cursor-pointer hover:bg-surface-2")}>
                            <Checkbox checked={checked} disabled={readOnly} onCheckedChange={(v) => toggle(p.key, v === true)} className="mt-0.5" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 text-sm text-text">
                                {p.label}
                                {p.sensitive && <Badge tone="warn">Sensitive</Badge>}
                              </span>
                              <span className="block text-xs text-muted">{p.description}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })
          )}
          {!readOnly && sensitive.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              This role includes {sensitive.length} sensitive permission{sensitive.length > 1 ? "s" : ""}: {sensitive.map((p) => p.label.toLowerCase()).join(", ")}.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
