"use client";

import { useEffect, useState } from "react";

import { confirm } from "@/components/shared/dialogs";
import { providerIcon } from "@/components/shared/provider-icon";
import { TextButton } from "@/components/ui/button";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { type IdentitiesView, socialProviderLabel } from "@/lib/payments";
import { allowsDev, canUse, socialSignIn } from "@/lib/social-sign-in";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

const PROVIDERS = ["google", "apple", "facebook"];

/** The e-mail, linked Google/Apple/Facebook, link another, unlink (never the last one). */
export function SignInMethodsCard() {
  const [view, setView] = useState<IdentitiesView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setView(await useSession.getState().identities());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    useSession
      .getState()
      .identities()
      .then(setView)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const run = async (provider: string, fn: () => Promise<IdentitiesView | null>, done: string) => {
    setBusy(provider);
    try {
      const v = await fn();
      if (v) {
        setView(v);
        toast(done);
      }
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(null);
    }
  };

  const link = (p: string) =>
    run(
      p,
      async () => {
        const cred = await socialSignIn(p);
        return cred ? useSession.getState().linkIdentity(cred) : null;
      },
      `${socialProviderLabel(p)} linked`,
    );

  const unlink = async (p: string) => {
    const ok = await confirm({
      title: `Unlink ${socialProviderLabel(p)}?`,
      body: "You will no longer be able to sign in with it. You can link it again later.",
      ok: "Unlink",
      okTone: "bad",
    });
    if (ok) await run(p, () => useSession.getState().unlinkIdentity(p), `${socialProviderLabel(p)} unlinked`);
  };

  if (!view) {
    return (
      <GroupCard dividerInset={52}>
        <GroupRow bare icon="key" title="Sign-in methods" subtitle={error ?? "Loading…"} trailing={error ? <TextButton onClick={() => void load()}>Retry</TextButton> : undefined} />
      </GroupCard>
    );
  }

  const canLink = (p: string) => view.available.includes(p) && (canUse(p) || allowsDev());
  const linked = (p: string) => view.identities.find((i) => i.provider === p);
  const providers = PROVIDERS.filter((p) => linked(p) || canLink(p));

  return (
    <GroupCard dividerInset={52}>
      {view.email ? <GroupRow bare icon="mail_outline" title="E-mail code" subtitle={view.email} /> : null}
      {providers.map((p) => {
        const l = linked(p);
        const icon = providerIcon(p);
        return (
          <GroupRow
            key={p}
            bare
            icon={icon.name}
            iconVariant={icon.variant}
            title={socialProviderLabel(p)}
            subtitle={l ? (l.email ?? "Linked") : "Not linked"}
            trailing={
              busy === p ? (
                <Spinner size={18} stroke={2} className="text-text2" />
              ) : l ? (
                <TextButton className="text-[13px] text-bad" onClick={busy ? undefined : () => void unlink(p)}>
                  Unlink
                </TextButton>
              ) : (
                <TextButton className="text-[13px]" onClick={busy || !canLink(p) ? undefined : () => void link(p)}>
                  Link
                </TextButton>
              )
            }
          />
        );
      })}
      {!view.email && !providers.length ? <GroupRow bare icon="key" title="No other sign-in methods available" /> : null}
    </GroupCard>
  );
}
