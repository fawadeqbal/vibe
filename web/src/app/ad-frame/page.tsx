"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { loadMonetagSdk } from "@/lib/ads/monetag";
import { config } from "@/lib/config";

/** The app's WebView listens on this JavaScript channel. */
declare global {
  interface Window {
    VibeAds?: { postMessage: (m: string) => void };
  }
}

/**
 * The phone app plays Monetag through this page (Monetag has no app SDK for
 * rewarded videos): the app opens it in a full-screen WebView with the token
 * from `POST /wallet/rewards/ad/start`, the ad plays, and the page reports
 * `rewarded` or `failed:<reason>` back on the `VibeAds` channel. The zone and
 * script come from the API's public /v1/config, never from this URL.
 */
function Frame() {
  const q = useSearchParams();
  const [text, setText] = useState("Getting a video…");

  useEffect(() => {
    const token = q.get("t") ?? "";
    const report = (m: string) => {
      window.VibeAds?.postMessage(m);
      if (window.parent !== window) window.parent.postMessage({ type: "vibe-ad", result: m }, "*");
    };
    let cancelled = false;
    void (async () => {
      try {
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) throw new Error("bad token");
        const res = await fetch(`${config.restBase}/config`);
        const monetag = ((await res.json()) as { monetag?: { zoneId: string; sdkUrl: string } | null }).monetag;
        if (!monetag) throw new Error("off");
        const show = await loadMonetagSdk(monetag);
        if (cancelled) return;
        await show({ ymid: token, requestVar: "app-store" });
        setText("Done — going back…");
        report("rewarded");
      } catch (e) {
        setText("No video right now.");
        report(`failed:${(e as Error).message || "no video"}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg text-text">
      <Spinner size={28} stroke={3} />
      <p className="type-body text-[14px] text-muted">{text}</p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Frame />
    </Suspense>
  );
}
