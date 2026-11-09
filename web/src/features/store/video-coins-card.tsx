"use client";

import { useEffect, useState } from "react";

import { useRewardedAds } from "@/components/shared/rewarded-ads";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useCatalog } from "@/stores/catalog";
import { toast } from "@/stores/ui";
import { adsLeftToday, useWallet } from "@/stores/wallet";

type Phase = "ready" | "loading" | "adding" | "noFill";

const NOTE: Record<Phase | "limit", string> = {
  ready: "You choose when. Coins land after the video ends.",
  loading: "This takes a second or two.",
  adding: "Checking the view with the ad network…",
  noFill: "No video to show right now. Try again in a minute.",
  limit: "Come back after midnight for more.",
};

/**
 * "Watch a short video" in the Store: the only place Vibe shows ads. Opt-in,
 * a daily limit (Economy → Free coins), and coins only after the network
 * confirms the view. The network comes from Settings → Ads; off hides the card.
 */
export function VideoCoinsCard() {
  const ads = useRewardedAds((s) => s.ads);
  const perDay = useCatalog((s) => s.economy.rewardedAdsPerDay);
  const coins = useCatalog((s) => s.economy.rewardedAdCoins);
  const left = useWallet(adsLeftToday);
  const [phase, setPhase] = useState<Phase>("ready");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void useRewardedAds.getState().load();
  }, []);

  if (!ads.available || perDay <= 0) return null;

  const watched = Math.min(perDay, Math.max(0, perDay - left));
  const limit = left <= 0 && phase !== "adding";
  const busy = phase === "loading" || phase === "adding";

  const watch = async () => {
    if (busy || limit) return;
    setNote(null);
    setPhase("loading");
    const r = await ads.show();
    if (r.outcome === "dismissed") return setPhase("ready");
    if (r.outcome !== "rewarded" || !r.token) {
      setNote(r.message ?? null);
      return setPhase("noFill");
    }
    setPhase("adding");
    try {
      const got = await useWallet.getState().rewardAd(r.token);
      if (got == null) toast("You've watched all of today's videos", { error: true });
      else toast(`+${got} coins added`);
      setPhase("ready");
    } catch (e) {
      setNote(errorMessage(e));
      setPhase("noFill");
    }
  };

  const label = limit ? `All ${perDay} watched today` : phase === "loading" ? "Getting a video…" : phase === "adding" ? "Adding your coins…" : phase === "noFill" ? "Try again" : watched > 0 ? `Watch another · +${coins}` : `Watch · +${coins} coins`;

  return (
    <section aria-label="Watch a short video for coins" className={cn("mb-2.5 rounded-card border bg-surface p-4", limit || busy ? "border-line" : "border-gold/35")}>
      <div className="flex items-center gap-3.5">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[16px] bg-gold/14 text-gold">
          <Icon name="play_arrow" size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-title text-[16px] font-bold">Watch a short video</p>
          <p className="type-body mt-0.5 text-[13px] text-muted">{limit ? "All done for today" : `Get +${coins} coins each time · ${left} of ${perDay} left today`}</p>
        </div>
      </div>
      <div className="mt-3.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${perDay}, minmax(0, 1fr))` }} role="img" aria-label={`${watched} of ${perDay} watched today`}>
        {Array.from({ length: perDay }, (_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full", i < watched ? "bg-gold" : "bg-surface2")} />
        ))}
      </div>
      <div className="mt-3.5">
        {limit || busy ? (
          <GhostButton label={label} height={50} expand trailing={busy ? <Spinner size={16} stroke={2} /> : undefined} />
        ) : phase === "noFill" ? (
          <GhostButton label={label} icon="refresh" height={50} expand onClick={() => void watch()} />
        ) : (
          <GradientButton label={label} icon="play_arrow" tone="gold" height={50} onClick={() => void watch()} />
        )}
      </div>
      <p className="type-body mt-2.5 text-center text-[12px] text-muted" aria-live="polite">
        {note ?? NOTE[limit ? "limit" : phase]}
      </p>
    </section>
  );
}
