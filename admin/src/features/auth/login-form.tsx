"use client";

import { KeyRound, Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, authApi } from "@/lib/api/client";

/** E-mail + password, then (when 2FA is on) the authenticator code. */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = React.useState<{ kind: "password" } | { kind: "code"; challenge: string }>({ kind: "password" });
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const done = () => {
    const next = params.get("next");
    // Only same-site paths, never an absolute URL.
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = step.kind === "password" ? await authApi.login(email, password) : await authApi.loginTwoFactor(step.challenge, code);
      if (r.status === "two_factor_required") {
        setStep({ kind: "code", challenge: r.challenge });
        setBusy(false);
        return;
      }
      done();
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      if (step.kind === "code" && (e.details?.attemptsLeft === 0 || e.message.includes("expired"))) {
        setStep({ kind: "password" });
        setCode("");
      }
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-text">{step.kind === "password" ? "Sign in" : "Two-factor code"}</h1>
      <p className="mt-1 text-sm text-muted">{step.kind === "password" ? "Use your staff account." : "Enter the 6-digit code from your authenticator app, or a recovery code."}</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {step.kind === "password" ? (
          <>
            <Field label="E-mail">
              <Input leading={<Mail />} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Field label="Password">
              <Input leading={<Lock />} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Code">
            <Input
              leading={<KeyRound />}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              placeholder="123 456"
              className="font-mono tracking-widest"
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {step.kind === "password" ? "Continue" : "Verify and sign in"}
        </Button>
        {step.kind === "code" && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep({ kind: "password" })}>
            Use a different account
          </Button>
        )}
      </form>
    </Card>
  );
}
