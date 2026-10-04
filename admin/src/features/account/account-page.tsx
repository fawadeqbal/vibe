"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { DescriptionList, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { meKey, useMe } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";

import { ChangePasswordForm, SessionsList, TwoFactorManage, TwoFactorSetup } from "./security";

export function AccountPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = React.useState(me?.name ?? "");
  const save = useMutation({
    mutationFn: () => api.patch<Me>("admin/auth/me", { name }),
    onSuccess: (r) => {
      qc.setQueryData(meKey, r);
      toast.success("Saved");
    },
  });
  if (!me) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Your account" description="Your profile, password, two-factor and where you're signed in." />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="space-y-4">
            <DescriptionList
              items={[
                { label: "E-mail", value: me.email },
                { label: "Role", value: <Badge tone="primary">{me.role.name}</Badge> },
                { label: "Member since", value: <Time iso={me.createdAt} mode="date" /> },
                { label: "Last sign-in", value: <Time iso={me.lastLoginAt} /> },
              ]}
            />
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Field label="Display name" className="w-64">
                <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} />
              </Field>
              <Button type="submit" loading={save.isPending} disabled={name.trim() === me.name || name.trim().length < 2}>
                Save
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Two-factor authentication" description="A code from your phone at every sign-in." actions={me.twoFactorEnabled ? <Badge tone="ok">On</Badge> : <Badge tone="warn">Off</Badge>} />
          <CardBody>{me.twoFactorEnabled ? <TwoFactorManage me={me} /> : <TwoFactorSetup />}</CardBody>
        </Card>

        <Card>
          <CardHeader title="Password" description="Changing it signs out your other sessions." />
          <CardBody className="max-w-sm">
            <ChangePasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Where you're signed in" />
          <CardBody className="py-1">
            <SessionsList />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
