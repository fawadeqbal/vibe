export type AdOutcome = "rewarded" | "dismissed" | "noFill" | "unavailable";

export interface AdResult {
  outcome: AdOutcome;
  /** Rewarded: the token the server checks before paying (`POST /wallet/rewards/ad`). */
  token?: string;
  message?: string;
}

/**
 * One rewarded-video network. The Store only talks to this interface, so a new
 * network (e.g. Google Ad Manager rewarded ads on the web) is one more class
 * plus a case in `adsFor` — the card, the claim and the wallet stay the same.
 */
export interface RewardedAds {
  readonly available: boolean;
  show(): Promise<AdResult>;
}

/** `GET /wallet/rewards/ad/setup?platform=web`: the network the admin picked (Settings → Ads). */
export interface AdSetup {
  provider: "off" | "monetag" | "admob";
  config?: Record<string, string>;
}
