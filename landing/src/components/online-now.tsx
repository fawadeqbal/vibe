"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { site } from "@/lib/site";

const POLL_MS = 30_000;
const noChanges = () => () => {};
const fmt = new Intl.NumberFormat("en-US");

/** 21 → "9 pm", 24 → "midnight", 13.5 → "1:30 pm". */
function clock(h: number) {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.round((t - hh) * 60);
  if (hh === 0 && mm === 0) return "midnight";
  if (hh === 12 && mm === 0) return "noon";
  return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "am" : "pm"}`;
}

/** "4 – 7 pm" for the visitor's own clock, or null when they're already on Pakistan time. */
function inVisitorTime(from: number, to: number, offsetMinutes: number): string | null {
  const local = -new Date().getTimezoneOffset();
  if (local === offsetMinutes) return null;
  const shift = (local - offsetMinutes) / 60;
  return `${clock(from + shift)} – ${clock(to + shift)}`;
}

/**
 * The hero pill. Shows the real number of people online when there are
 * enough to be worth saying; otherwise says when people are usually on, in
 * the visitor's own time, so newcomers arrive when someone is there to meet.
 * Never shows a made-up number.
 */
export function OnlineNow() {
  const [count, setCount] = useState<number | null>(null);
  const { from, to, offsetMinutes, zone } = site.busyHours;
  // The visitor's own clock (null on the server and for visitors on Pakistan time).
  const yourTime = useSyncExternalStore(
    noChanges,
    () => inVisitorTime(from, to, offsetMinutes),
    () => null,
  );

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
          if (alive && typeof body.online === "number" && Number.isFinite(body.online)) setCount(Math.max(0, Math.round(body.online)));
        }
      } catch {
        // Offline or blocked: keep the last real number (or the busy hours).
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

  const live = count !== null && count >= site.onlineMinToShow;
  return (
    <p className="inline-flex min-h-[30px] items-center gap-2 rounded-full border border-white/14 px-3 py-1 text-[12.5px] font-medium text-text2">
      {live ? (
        <>
          <span aria-hidden="true" className="relative size-2 shrink-0 rounded-full bg-ok shadow-[0_0_0_4px_rgb(52_211_153/0.16)]">
            <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60 [animation-duration:2.4s]" />
          </span>
          <span>
            <span className="font-semibold text-text tabular-nums">{fmt.format(count)}</span> people online right now
          </span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-lavender" />
          <span>
            Busiest <span className="font-semibold text-text">{clock(from)} – {clock(to)}</span> {zone}
            {yourTime ? <span className="text-text2"> · {yourTime} your time</span> : null}
          </span>
        </>
      )}
    </p>
  );
}
