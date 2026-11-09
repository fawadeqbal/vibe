import { ApiError } from "@/lib/api/errors";

import type { AdResult, RewardedAds } from "./types";

/** What the API sends for Monetag (`GET /wallet/rewards/ad/setup`). */
export interface MonetagSetup {
  zoneId: string;
  sdkUrl: string;
}

type ShowFn = (opts: { ymid: string; requestVar?: string }) => Promise<unknown>;

export interface MonetagDeps {
  /** `POST /wallet/rewards/ad/start` → the one-off token Monetag echoes back as `ymid`. */
  start: () => Promise<{ token: string }>;
  /** Adds the SDK script once; resolves when `show_<zone>` exists. */
  loadSdk: (setup: MonetagSetup) => Promise<ShowFn>;
}

/**
 * Monetag Rewarded Interstitial. The ad plays full screen over the page and
 * `show_<zone>()` resolves once it was watched; Monetag then tells our server
 * (postback with the token), and the claim pays. Never a pop-up: only the
 * rewarded interstitial format is used.
 */
export class MonetagAds implements RewardedAds {
  readonly available = true;
  private showing = false;

  constructor(
    private readonly setup: MonetagSetup,
    private readonly deps: MonetagDeps = { start: () => Promise.reject(new Error("no api")), loadSdk: loadMonetagSdk },
  ) {}

  async show(): Promise<AdResult> {
    if (this.showing) return { outcome: "dismissed" };
    this.showing = true;
    try {
      const { token } = await this.deps.start();
      let show: ShowFn;
      try {
        show = await this.deps.loadSdk(this.setup);
      } catch {
        return { outcome: "noFill", message: "Videos can't load here. If you use an ad blocker, pause it for Vibe." };
      }
      try {
        await show({ ymid: token, requestVar: "store" });
      } catch {
        return { outcome: "noFill", message: "No video to show right now. Try again in a minute." };
      }
      return { outcome: "rewarded", token };
    } catch (e) {
      if (e instanceof ApiError) return { outcome: "unavailable", message: e.message };
      return { outcome: "noFill", message: "No video to show right now. Try again in a minute." };
    } finally {
      this.showing = false;
    }
  }
}

const loading = new Map<string, Promise<ShowFn>>();

/** Injects `<script src=sdkUrl data-zone data-sdk="show_<zone>">` once and waits for the function. */
export function loadMonetagSdk({ zoneId, sdkUrl }: MonetagSetup, timeoutMs = 10_000): Promise<ShowFn> {
  const name = `show_${zoneId}`;
  const ready = () => (window as unknown as Record<string, ShowFn | undefined>)[name];
  const existing = loading.get(name);
  if (existing) return existing;
  const p = new Promise<ShowFn>((resolve, reject) => {
    if (ready()) return resolve(ready()!);
    const s = document.createElement("script");
    s.src = sdkUrl;
    s.async = true;
    s.dataset.zone = zoneId;
    s.dataset.sdk = name;
    const started = Date.now();
    const poll = () => {
      const fn = ready();
      if (fn) return resolve(fn);
      if (Date.now() - started > timeoutMs) return reject(new Error("Monetag SDK did not load"));
      setTimeout(poll, 100);
    };
    s.onload = poll;
    s.onerror = () => reject(new Error("Monetag SDK blocked"));
    document.head.appendChild(s);
  });
  // A failed load (ad blocker, offline) may succeed on the next tap.
  p.catch(() => loading.delete(name));
  loading.set(name, p);
  return p;
}
