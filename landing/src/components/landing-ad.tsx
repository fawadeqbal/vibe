"use client";

import { useEffect } from "react";

import { site } from "@/lib/site";

/**
 * The Monetag Vignette, only while admin → Settings → Ads has it on. Reads
 * `landingAd` from the API's public /v1/config once per visit, so switching it
 * off (or changing the zone) needs no deploy.
 */
export function LandingAd() {
  useEffect(() => {
    if (!site.configUrl) return;
    let cancelled = false;
    void fetch(site.configUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { landingAd?: { zoneId: string; src: string } | null } | null) => {
        const ad = c?.landingAd;
        if (cancelled || !ad || !/^\d+$/.test(ad.zoneId) || !ad.src.startsWith("https://")) return;
        if (document.querySelector(`script[data-zone="${ad.zoneId}"]`)) return;
        const s = document.createElement("script");
        s.dataset.zone = ad.zoneId;
        s.src = ad.src;
        s.async = true;
        document.body.appendChild(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
