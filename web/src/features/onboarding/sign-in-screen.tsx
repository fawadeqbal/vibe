"use client";

import { type FormEvent, useEffect, useState } from "react";

import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { VibeLogo } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/ui/text-field";
import { Headline } from "@/components/ui/typography";
import { providerIcon } from "@/components/shared/provider-icon";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { socialProviderLabel } from "@/lib/payments";
import { canUse, socialSignIn, visibleProviders } from "@/lib/social-sign-in";
import { useSession } from "@/stores/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** E-mail first (we send a 4-digit code), social buttons under it. */
export function SignInScreen() {
  const busy = useSession((s) => s.busy);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeStep, setCodeStep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [providers, setProviders] = useState<string[]>([]);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const address = email.trim().toLowerCase();

  useEffect(() => {
    void useSession
      .getState()
      .socialProviders()
      .then((server) => setProviders(visibleProviders(server)));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    if (!EMAIL.test(address)) return setError("Enter a valid e-mail address.");
    setError(null);
    try {
      await useSession.getState().requestCode(address);
      setCodeStep(true);
      setResendIn(30);
    } catch (e) {
      setError(errorMessage(e));
      // "Wait 21s before asking for another code": still on the code step.
      const wait = e instanceof ApiError ? e.details.retryIn : undefined;
      if (typeof wait === "number" && codeStep) setResendIn(wait);
    }
  };

  const verify = async () => {
    if (code.trim().length !== 4) return setError("The code is 4 digits.");
    setError(null);
    try {
      await useSession.getState().signInWithEmail(address, code.trim());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const social = async (provider: string) => {
    setError(null);
    setSocialBusy(provider);
    try {
      const credential = await socialSignIn(provider);
      if (credential) await useSession.getState().signInWith(credential);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSocialBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void (codeStep ? verify() : sendCode());
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-[460px] flex-col p-6 lg:my-auto" noValidate>
        <VibeLogo size={44} shadow={false} />
        <div className="mt-7">
          {codeStep ? <Headline text="Enter the " accent="code" size={34} accentColor="pink-soft" /> : <Headline text="Your " accent="email" size={34} accentColor="pink-soft" />}
        </div>
        <p className="type-body mt-2 text-[15px] leading-[1.5] text-text2">
          {codeStep
            ? `We emailed a 4-digit code to ${address}. Not there in a minute? Check your spam folder.`
            : "We'll email you a 4-digit code to sign in. Nobody on Vibe sees your address."}
        </p>

        <div className="mt-7">
          {!codeStep ? (
            <TextField
              key="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              autoFocus
              aria-label="E-mail address"
              placeholder="you@gmail.com"
              prefixIcon="mail_outline"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputClassName="type-title text-[18px] font-semibold placeholder:font-normal placeholder:text-[15px] placeholder:tracking-normal"
            />
          ) : (
            <TextField
              key="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              autoFocus
              aria-label="Sign-in code"
              placeholder="••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputClassName="type-display text-center text-[30px] placeholder:text-[15px]"
            />
          )}
        </div>
        {error ? <p className="type-body mt-2.5 text-[13px] text-bad">{error}</p> : null}

        <div className="mt-5">
          <GradientButton label={codeStep ? "Verify and continue" : "Send code"} busy={busy} onClick={() => void (codeStep ? verify() : sendCode())} />
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />

        {codeStep ? (
          <div className="mt-2.5 flex items-center justify-center">
            <TextButton className={resendIn > 0 ? "text-muted" : undefined} onClick={busy || resendIn > 0 ? undefined : () => void sendCode()}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </TextButton>
            <span className="type-label text-[14px] text-muted">·</span>
            <TextButton
              className="text-text2"
              onClick={() => {
                setCodeStep(false);
                setCode("");
                setError(null);
              }}
            >
              Change email
            </TextButton>
          </div>
        ) : null}

        {providers.length ? (
          <>
            <div className="mt-7 flex items-center">
              <span className="h-px flex-1 bg-line" />
              <span className="type-label px-3 text-[12px] text-muted">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="mt-5 flex flex-col gap-2.5">
              {providers.map((p) => (
                <GhostButton
                  key={p}
                  label={`Continue with ${socialProviderLabel(p)}${canUse(p) ? "" : " (dev)"}`}
                  icon={providerIcon(p).name}
                  iconVariant={providerIcon(p).variant}
                  expand
                  onClick={busy || socialBusy ? undefined : () => void social(p)}
                  trailing={socialBusy === p ? <Spinner size={16} stroke={2} className="text-text2" /> : undefined}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className={cn("flex items-center justify-center", providers.length ? "mt-5" : "mt-2.5")}>
          <Icon name="lock" size={14} className="text-trust" />
          <span className="type-label ml-1.5 text-[12px] font-medium text-text2">Your email is never shown to anyone</span>
        </div>
      </form>
    </div>
  );
}
