"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ctaId, goToApp, trackLeave, trackView } from "@/lib/track";

/**
 * Counts page views and time on site, and sends every click on a link into
 * the app or the store through `goToApp()` — one listener for the whole site,
 * so no button can be missed. Buttons name themselves with `data-cta`.
 */
export function Tracker() {
  const path = usePathname();

  useEffect(() => {
    trackView();
  }, [path]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const next = goToApp(ctaId(a.dataset.cta), a.href);
      if (next !== a.href) a.href = next;
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") trackLeave();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
