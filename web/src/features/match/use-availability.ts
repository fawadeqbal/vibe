"use client";

import { useEffect, useState } from "react";

import { asMap } from "@/lib/api/mappers";
import { api } from "@/stores/services";

/** Other people on Vibe right now (yourself left out). */
export interface Availability {
  /** Signed in with the app open. */
  online: number;
  /** In the match queue. */
  searching: number;
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/**
 * Live counts from `GET /match/online`, polled while the screen is open
 * (faster while you're in the queue). `null` until the first answer or if the
 * API can't say — callers hide the line rather than invent a number.
 * `inQueue` removes you from the searching count; a new `refreshKey` asks
 * again right away (e.g. when "someone's looking" arrives).
 */
/** The last answer, kept across screens: coming back to Match shows it at once, then refreshes (no blank, no jump). */
let lastCounts: { online: number; searching: number } | null = null;

export function useAvailability({ inQueue = false, everyMs = 20_000, refreshKey }: { inQueue?: boolean; everyMs?: number; refreshKey?: unknown } = {}): Availability | null {
  const [counts, setCounts] = useState<{ online: number; searching: number } | null>(lastCounts);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const m = asMap(await api.get("/match/online"));
        lastCounts = { online: int(m.online), searching: int(m.searching) };
        if (alive) setCounts(lastCounts);
      } catch {
        // Keep the last answer; a blip shouldn't blank the line.
      }
    };
    void load();
    const t = setInterval(() => void load(), everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [everyMs, refreshKey]);

  if (!counts) return null;
  // The online count includes you (you're connected); the queue does once you've joined it.
  return { online: Math.max(0, counts.online - 1), searching: Math.max(0, counts.searching - (inQueue ? 1 : 0)) };
}
