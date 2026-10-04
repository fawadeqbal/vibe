"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { useMe, useSignOut } from "@/features/auth/session";

import { ChangePasswordForm, TwoFactorSetup } from "./security";

type Stage = "password" | "2fa" | "done";

/** Required steps before the panel opens: a new password, then 2FA when the org requires it. */
export function SetupFlow() {
  const me = useMe();
  const router = useRouter();
  const signOut = useSignOut();
  // Once 2FA setup starts, stay on it until the recovery codes are saved
  // (the profile flips to "enabled" before the person has copied them).
  const [pinned2fa, setPinned2fa] = React.useState(false);
  const [finished, setFinished] = React.useState(false);

  const stage: Stage | null = !me.data ? null : me.data.mustChangePassword ? "password" : !finished && (pinned2fa || me.data.twoFactorSetupRequired) ? "2fa" : "done";

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pin the step once entered
    if (stage === "2fa" && !pinned2fa) setPinned2fa(true);
  }, [stage, pinned2fa]);

  React.useEffect(() => {
    // Nothing to do here (opened by hand): go to the panel.
    if (me.data && !me.data.mustChangePassword && !me.data.twoFactorSetupRequired && !pinned2fa && !finished) router.replace("/");
  }, [me.data, pinned2fa, finished, router]);

  if (!stage) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <Card className="p-6">
      <p className="text-xs font-medium text-primary">Secure your account</p>
      {stage === "password" && (
        <>
          <h1 className="mt-1 text-lg font-semibold text-text">Choose your own password</h1>
          <p className="mt-1 mb-5 text-sm text-muted">You signed in with a temporary password. Pick a new one only you know.</p>
          <ChangePasswordForm submitLabel="Save password" />
        </>
      )}
      {stage === "2fa" && (
        <>
          <h1 className="mt-1 text-lg font-semibold text-text">Turn on two-factor</h1>
          <p className="mt-1 mb-5 text-sm text-muted">Staff accounts here need a code from your phone at sign-in.</p>
          <TwoFactorSetup onDone={() => setFinished(true)} />
        </>
      )}
      {stage === "done" && (
        <>
          <h1 className="mt-1 text-lg font-semibold text-text">You&apos;re all set</h1>
          <p className="mt-1 mb-5 text-sm text-muted">Your account is secured.</p>
          <Button variant="primary" className="w-full" onClick={() => router.replace("/")}>
            Open the admin panel
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => void signOut()}>
        Sign out
      </Button>
    </Card>
  );
}
