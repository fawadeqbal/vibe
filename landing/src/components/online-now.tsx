"use client";

import { useEffect, useState } from "react";

import { site } from "@/lib/site";

const POLL_MS = 30_000;
const fmt = new Intl.NumberFormat("en-US");

/**
 * "2,743 people online right now". Reads the live count from the API and keeps
 * it fresh while the tab is visible; shows the configured fallback until the
 * first answer and whenever the API can't be reached.
 */
export function OnlineNow() {
  const [count, setCount] = useState<number>(site.onlineFallback);

  useEffect(() => {
    const url = site.onlineUrl;
    if (!url) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;

    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { online?: unknown };
          if (alive && typeof body.online === "number" && Number.isFinite(body.online) && body.online > 0) setCount(Math.round(body.online));
        }
      } catch {
        // Offline or blocked: keep showing the last number we had.
      }
      if (alive && document.visibilityState === "visible") timer = setTimeout(load, POLL_MS);
    };

    const onVisible = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") load();
    };

    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <p className="inline-flex h-[30px] items-center gap-2 rounded-full border border-white/14 px-3 text-[12.5px] font-medium text-text2">
      <span aria-hidden="true" className="relative size-2 rounded-full bg-ok shadow-[0_0_0_4px_rgb(52_211_153/0.16)]">
        <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60 [animation-duration:2.4s]" />
      </span>
      <span>
        <span className="font-semibold text-text tabular-nums">{fmt.format(count)}</span> people online right now
      </span>
    </p>
  );
}
