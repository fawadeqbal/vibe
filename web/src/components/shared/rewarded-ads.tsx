"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

import { GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { loadMonetagSdk, MonetagAds } from "@/lib/ads/monetag";
import type { AdSetup, RewardedAds } from "@/lib/ads/types";
import { config } from "@/lib/config";
import { flutterGradientCss } from "@/lib/gradients";
import { api } from "@/stores/services";
import { openDialog } from "@/stores/ui";

export type { AdOutcome, AdResult, RewardedAds } from "@/lib/ads/types";

const noAds: RewardedAds = {
  available: false,
  show: async () => ({ outcome: "unavailable", message: "Videos are off for now." }),
};

/** Development only: a 5-second stand-in, paid by a backend with ADS_VERIFIER=dev. */
const mockAds: RewardedAds = {
  available: true,
  async show() {
    const watched = await openDialog<boolean>((close) => <MockAdDialog onClaim={() => close(true)} />, false, { bare: true });
    if (!watched) return { outcome: "dismissed" };
    return { outcome: "rewarded", token: `dev-ad-${Date.now()}-${Math.floor(Math.random() * 2 ** 30)}` };
  },
};

/** The network the admin picked for the website (Settings → Ads). Add new networks here. */
export function adsFor(setup: AdSetup | null): RewardedAds {
  const c = setup?.config ?? {};
  if (setup?.provider === "monetag" && c.zoneId && c.sdkUrl) {
    return new MonetagAds(
      { zoneId: c.zoneId, sdkUrl: c.sdkUrl },
      { start: () => api.post<{ token: string }>("/wallet/rewards/ad/start", { platform: "web" }), loadSdk: loadMonetagSdk },
    );
  }
  return config.devAds ? mockAds : noAds;
}

/** Store videos for this session: `load()` asks the server which network to use. */
export const useRewardedAds = create<{ ads: RewardedAds; load: () => Promise<void> }>((set) => ({
  ads: noAds,
  async load() {
    const setup = await api.get<AdSetup>("/wallet/rewards/ad/setup", { platform: "web" }).catch(() => null);
    set({ ads: adsFor(setup) });
  },
}));

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
        <p className="type-body mt-1 text-[13px] text-white/70">A real video ad plays here.</p>
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
