"use client";

import { useState } from "react";

import { GhostButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { normaliseCode } from "@/lib/referrals";
import { useCatalog } from "@/stores/catalog";
import { useReferrals } from "@/stores/referrals";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

/**
 * "Have an invite code?" — only while the server says a late claim is still
 * possible (`referralClaimable`: no invite yet, account under 48 h). Starts
 * folded; a code captured from a link is filled in.
 */
export function InviteCodeField({ className, startOpen = false }: { className?: string; startOpen?: boolean }) {
  const claimable = useSession((s) => s.referralClaimable);
  const captured = useReferrals((s) => s.captured);
  const coins = useCatalog((s) => s.economy.inviteeRewardCoins);
  const [open, setOpen] = useState(startOpen || !!captured);
  const [code, setCode] = useState(captured?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!claimable) return null;

  const submit = async () => {
    const c = normaliseCode(code);
    if (!c) return setError("Codes are 3–20 letters, digits or _.");
    setError(null);
    setBusy(true);
    try {
      const r = await useReferrals.getState().claim(c);
      toast(r.status === "REJECTED" ? "Code added, but this invite can't earn coins" : `${r.inviterName || "Your friend"} invited you · ${r.inviteeCoins || coins} coins once you're active`, { error: r.status === "REJECTED" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that code.");
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <div className={cn("flex justify-center", className)}>
        <TextButton icon="card_giftcard" className="text-[13.5px] text-text2" onClick={() => setOpen(true)}>
          Have an invite code?
        </TextButton>
      </div>
    );

  return (
    <div className={cn("rounded-[20px] border border-line bg-surface p-3.5", className)}>
      <p className="flex items-center">
        <Icon name="card_giftcard" size={18} className="text-gold" />
        <span className="type-title ml-2 flex-1 text-[14px]">Have an invite code?</span>
      </p>
      <p className="type-body mt-1 text-[12.5px] text-text2">Add it in your first 48 hours and get {coins} coins once you&apos;re active.</p>
      <form
        className="mt-3 flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          className="min-w-0 flex-1"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20));
            setError(null);
          }}
          placeholder="e.g. K7P2QXM"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Invite code"
          error={error}
          inputClassName="type-mono py-3 text-[16px] tracking-[1px]"
        />
        <GhostButton label={busy ? "Adding…" : "Add"} height={50} className="shrink-0" onClick={busy || !code.trim() ? undefined : () => void submit()} />
      </form>
    </div>
  );
}
