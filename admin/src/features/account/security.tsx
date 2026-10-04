"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Monitor, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { meKey } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { Me, StaffSession } from "@/lib/api/types";

/** Current + new password, with the API's rules (10+ chars, letters and digits). */
export function ChangePasswordForm({ onDone, submitLabel = "Change password" }: { onDone?: () => void; submitLabel?: string }) {
  const qc = useQueryClient();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const mismatch = repeat.length > 0 && next !== repeat;
  const weak = next.length > 0 && (next.length < 10 || !/[a-zA-Z]/.test(next) || !/\d/.test(next));
  const m = useMutation({
    mutationFn: () => api.post<Me>("admin/auth/password", { currentPassword: current, newPassword: next }),
    onSuccess: (me) => {
      qc.setQueryData(meKey, me);
      toast.success("Password changed. Other sessions were signed out.");
      setCurrent("");
      setNext("");
      setRepeat("");
      onDone?.();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch && !weak) m.mutate();
      }}
    >
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 10 characters, with letters and numbers." error={weak ? "Use 10+ characters with letters and numbers" : undefined}>
        <Input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Repeat new password" error={mismatch ? "Doesn't match" : undefined}>
        <Input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" loading={m.isPending} disabled={!current || !next || mismatch || weak}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Scan → confirm with a code → save recovery codes. */
export function TwoFactorSetup({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [secret, setSecret] = React.useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);

  const start = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUrl: string }>("admin/auth/2fa/setup"),
    onSuccess: async (r) => setSecret({ ...r, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 200 }) }),
  });
  const enable = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>("admin/auth/2fa/enable", { code: code.replace(/\s/g, "") }),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      void qc.invalidateQueries({ queryKey: meKey });
    },
  });

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

  if (!secret) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-2">Use an authenticator app (Google Authenticator, 1Password, Authy…). You&apos;ll enter a code from it each time you sign in.</p>
        <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending}>
          <ShieldCheck />
          Set up two-factor
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={secret.qr} alt="QR code for your authenticator app" width={160} height={160} className="rounded-lg border border-line bg-white p-1" />
        <div className="space-y-2 text-sm">
          <p className="text-text-2">1. Scan this with your authenticator app.</p>
          <p className="text-text-2">Can&apos;t scan? Enter this key:</p>
          <code className="block rounded-md bg-surface-2 px-2 py-1.5 font-mono text-xs break-all text-text">{secret.secret.match(/.{1,4}/g)?.join(" ")}</code>
          <p className="text-text-2">2. Enter the 6-digit code it shows.</p>
        </div>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enable.mutate();
        }}
      >
        <Field label="Code" className="w-40">
          <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="font-mono tracking-widest" autoFocus />
        </Field>
        <Button type="submit" variant="primary" loading={enable.isPending} disabled={code.replace(/\s/g, "").length !== 6}>
          Turn on
        </Button>
      </form>
    </div>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone?: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const text = codes.join("\n");
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">Save these recovery codes somewhere safe. Each works once if you lose your phone. They won&apos;t be shown again.</div>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-surface-2 p-3 font-mono text-sm text-text">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" asChild>
          <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Vibe Admin recovery codes\n\n${text}\n`)}`} download="vibe-admin-recovery-codes.txt">
            <Download />
            Download
          </a>
        </Button>
        {onDone && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={onDone}>
            I&apos;ve saved them
          </Button>
        )}
      </div>
    </div>
  );
}

export function TwoFactorManage({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode] = React.useState<"idle" | "regen" | "disable">("idle");

  const regen = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>("admin/auth/2fa/recovery-codes", { code }),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      setMode("idle");
      setCode("");
      void qc.invalidateQueries({ queryKey: meKey });
    },
  });
  const disable = useMutation({
    mutationFn: () => api.post<Me>("admin/auth/2fa/disable", { password, code }),
    onSuccess: (r) => {
      qc.setQueryData(meKey, r);
      toast.success("Two-factor turned off");
      setMode("idle");
    },
  });

  if (codes) return <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-2">
        Two-factor is <span className="font-medium text-ok">on</span>. {me.recoveryCodesLeft} recovery code{me.recoveryCodesLeft === 1 ? "" : "s"} left.
      </p>
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setMode("regen")}>
            New recovery codes
          </Button>
          {!me.twoFactorSetupRequired && (
            <Button size="sm" variant="danger-ghost" onClick={() => setMode("disable")}>
              Turn off
            </Button>
          )}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "regen") regen.mutate();
            else disable.mutate();
          }}
        >
          {mode === "disable" && (
            <Field label="Password" className="w-48">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <Field label="Authenticator code" className="w-40">
            <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-widest" autoFocus />
          </Field>
          <Button type="submit" variant={mode === "disable" ? "danger" : "primary"} loading={regen.isPending || disable.isPending}>
            {mode === "disable" ? "Turn off" : "Generate"}
          </Button>
          <Button variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}

export function SessionsList() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["auth", "sessions"], queryFn: ({ signal }) => api.get<StaffSession[]>("admin/auth/sessions", undefined, signal) });
  if (q.isLoading) return <Skeleton className="h-24" />;
  return (
    <ul className="divide-y divide-line">
      {(q.data ?? []).map((s) => (
        <li key={s.id} className="flex items-center gap-3 py-2.5">
          <Monitor className="size-4 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-text">{describeAgent(s.userAgent)}</p>
            <p className="text-xs text-muted">
              {s.ip ?? "unknown IP"} · signed in <Time iso={s.signedInAt} /> · ends <Time iso={s.expiresAt} />
            </p>
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              void confirm({
                title: "End this session?",
                description: "That browser will be signed out. If it's this one, you'll need to sign in again.",
                confirmLabel: "End session",
                tone: "danger",
                action: async () => {
                  await api.delete(`admin/auth/sessions/${s.id}`);
                  await qc.invalidateQueries({ queryKey: ["auth", "sessions"] });
                },
              })
            }
          >
            End
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
