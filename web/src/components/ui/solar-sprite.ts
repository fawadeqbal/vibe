"use client";

import { useSyncExternalStore } from "react";

import { SOLAR_SPRITE_URL } from "./solar-sprite-url";

/**
 * Every Solar icon in one sheet (scripts/solar-sprite.mjs), fetched once and
 * put in the page, so <Icon> draws from it with a same-page `<use href="#…">`.
 * Before, each icon was its own file: every time a page mounted, Safari went
 * back for them and the icons blinked in late, making every tap feel slow.
 * Until the sheet is in (the first visit, behind the splash), icons use their
 * own files as before.
 */
let ready = false;
let started = false;
const listeners = new Set<() => void>();

export function loadSolarSprite(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  void (async () => {
    try {
      const res = await fetch(SOLAR_SPRITE_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
      host.innerHTML = await res.text();
      document.body.prepend(host);
      ready = true;
      listeners.forEach((l) => l());
    } catch {
      started = false; // try again on the next call (offline at launch)
    }
  })();
}

/** True once the sheet is in the page. */
export function useSolarSprite(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
    () => false,
  );
}
