"use client";

import { useEffect, useState } from "react";

import { GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { config } from "@/lib/config";
import { flutterGradientCss } from "@/lib/gradients";
import { openDialog } from "@/stores/ui";

export type AdOutcome = "rewarded" | "dismissed" | "noFill" | "unavailable";

export interface AdResult {
  outcome: AdOutcome;
  /** Rewarded: the nonce the server checks before paying. */
  token?: string;
  message?: string;
}

/**
 * Rewarded video ads (the app's `RewardedAds`). Real ads are AdMob, which only
 * exists on phones, so the web has two: the mock 5-second "video" in development
 * (a backend with ADS_VERIFIER=dev pays any unique token once) and none otherwise,
 * which hides the "Watch an ad" row.
 */
export interface RewardedAds {
  readonly available: boolean;
  show(): Promise<AdResult>;
}

const noAds: RewardedAds = {
  available: false,
  show: async () => ({ outcome: "unavailable", message: "Ads aren't available on the web." }),
};

const mockAds: RewardedAds = {
  available: true,
  async show() {
    const watched = await openDialog<boolean>((close) => <MockAdDialog onClaim={() => close(true)} />, false, { bare: true });
    if (!watched) return { outcome: "dismissed" };
    return { outcome: "rewarded", token: `dev-ad-${Date.now()}-${Math.floor(Math.random() * 2 ** 30)}` };
  },
};

export const rewardedAds: RewardedAds = config.devAds ? mockAds : noAds;

const AD_SECONDS = 5;
// topLeft → bottomRight on a 9:14 box (the ratio fixes the angle, so this is exact at any size).
const AD_BG = flutterGradientCss({ begin: [-1, -1], end: [1, 1], colors: ["#3A1D70", "#0B0A10"] }, 9, 14);

/** A 5-second "video ad" with a skip lock, the way rewarded ads behave. */
function MockAdDialog({ onClaim }: { onClaim: () => void }) {
  const [left, setLeft] = useState(AD_SECONDS);

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mx-auto aspect-[9/14] max-h-[calc(100dvh-32px)] w-full overflow-hidden rounded-[28px] bg-black" style={{ background: AD_BG }} aria-label="Ad">
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <Icon name="local_pizza" size={72} className="text-gold" />
        <p className="type-title mt-3 text-[20px] text-white">Mock advertiser</p>
        <p className="type-body mt-1 text-[13px] text-white/70">A real rewarded ad plays here (AdMob).</p>
      </div>
      <div className="absolute top-3 right-3">
        {left > 0 ? <GlassPill label={`Reward in ${left}s`} height={32} /> : <GlassPill label="Claim reward" icon="check" tint="gold" textColor="gold" height={32} onClick={onClaim} />}
      </div>
      <div className="absolute bottom-3 left-3">
        <GlassPill label="Ad" height={26} fontSize={10.5} />
      </div>
    </div>
  );
}
