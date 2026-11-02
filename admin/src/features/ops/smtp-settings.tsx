"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Mail, Send } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton, Switch } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";

interface SmtpView {
  source: "admin" | "env" | "none";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  passwordSet: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const key = ["ops", "mail", "smtp"] as const;

/**
 * Admin → Settings → E-mail sending. The password is write-only: it is sent
 * once, checked with the mail server, stored encrypted, and never shown again.
 */
export function SmtpSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<SmtpView>("admin/mail/smtp", undefined, signal) });
  const v = q.data;
  const [form, setForm] = React.useState<{ host: string; port: string; secure: boolean; user: string; from: string } | null>(null);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const f = form ?? (v ? { host: v.host, port: String(v.port), secure: v.secure, user: v.user, from: v.from } : null);
  const set = (patch: Partial<NonNullable<typeof f>>) => f && setForm({ ...f, ...patch });
  const userChanged = !!v && !!f && f.user.trim() !== v.user;
  const needsPassword = !v?.passwordSet || v.source !== "admin" || userChanged;

  const save = useMutation({
    mutationFn: () =>
      api.put<SmtpView>("admin/mail/smtp", { host: f!.host.trim(), port: Number(f!.port), secure: f!.secure, user: f!.user.trim(), from: f!.from.trim(), ...(password ? { password } : {}) }),
    onSuccess: async (r) => {
      setPassword("");
      setForm(null);
      setError(null);
      qc.setQueryData(key, r);
      toast.success("E-mail settings saved — the login works");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save"),
    meta: { silent: true },
  });
  const test = useMutation({
    mutationFn: () => api.post<{ sentTo: string }>("admin/mail/smtp/test"),
    onSuccess: (r) => toast.success(`Test e-mail sent to ${r.sentTo}`),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send the test e-mail"),
    meta: { silent: true },
  });

  const valid = !!f && f.host.trim().length > 2 && Number(f.port) > 0 && f.user.trim().length > 2 && (!needsPassword || password.trim().length > 0);

  return (
    <Card>
      <CardHeader
        title="E-mail sending"
        description="The mail server Vibe uses for sign-in codes and messages. For Gmail use smtp.gmail.com, port 465, SSL on, your address, and an App Password (Google Account → Security → App passwords)."
        actions={
          v ? (
            v.source === "admin" ? (
              <Badge tone="ok" dot>
                Set here
              </Badge>
            ) : v.source === "env" ? (
              <Badge tone="warn">From the server file</Badge>
            ) : (
              <Badge tone="bad">Not set up</Badge>
            )
          ) : null
        }
      />
      <CardBody>
        {!f ? (
          <Skeleton className="h-56" />
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) save.mutate();
            }}
          >
            <Field label="Mail server">
              <Input value={f.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.gmail.com" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <Field label="Port">
                <Input value={f.port} inputMode="numeric" onChange={(e) => set({ port: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="465" />
              </Field>
              <label className="flex h-9 items-center gap-2 text-sm text-text-2">
                <Switch checked={f.secure} onCheckedChange={(secure) => set({ secure })} aria-label="SSL" /> SSL
              </label>
            </div>
            <Field label="Username" hint="Usually your full e-mail address.">
              <Input value={f.user} onChange={(e) => set({ user: e.target.value })} placeholder="you@gmail.com" autoComplete="off" spellCheck={false} />
            </Field>
            <Field
              label="Password"
              hint={
                v?.passwordSet && v.source === "admin" && !userChanged
                  ? "Saved and hidden. Leave empty to keep it, or type a new one to replace it."
                  : "Never shown again after saving. It is stored encrypted."
              }
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={v?.passwordSet && v.source === "admin" && !userChanged ? "•••••••• (saved)" : "App Password"}
                autoComplete="new-password"
                leading={<KeyRound className="size-3.5" />}
              />
            </Field>
            <Field label="Sender people see" optional hint='For example: Vibe <you@gmail.com>. Empty = "Vibe" and the username.'>
              <Input value={f.from} onChange={(e) => set({ from: e.target.value })} placeholder="Vibe <you@gmail.com>" />
            </Field>
            <div className="flex flex-col justify-end gap-1 text-xs text-muted">
              {v?.updatedAt ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-ok" /> Changed <Time iso={v.updatedAt} />
                  {v.updatedBy ? ` by ${v.updatedBy}` : ""}
                </span>
              ) : v?.source === "env" ? (
                <span>Using the server&apos;s settings file. Save here to manage it from the panel.</span>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-sm text-bad sm:col-span-2">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!valid}>
                <Mail /> Check and save
              </Button>
              <Button type="button" variant="secondary" loading={test.isPending} disabled={v?.source === "none" || !!form || !!password} onClick={() => test.mutate()}>
                <Send /> Send me a test e-mail
              </Button>
              {form || password ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setForm(null);
                    setPassword("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
