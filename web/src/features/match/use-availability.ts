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
 * `inQueue` removes you from the searching count.
 */
export function useAvailability({ inQueue = false, everyMs = 20_000 }: { inQueue?: boolean; everyMs?: number } = {}): Availability | null {
  const [counts, setCounts] = useState<{ online: number; searching: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const m = asMap(await api.get("/match/online"));
        if (alive) setCounts({ online: int(m.online), searching: int(m.searching) });
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
  }, [everyMs]);

  if (!counts) return null;
  // The online count includes you (you're connected); the queue does once you've joined it.
  return { online: Math.max(0, counts.online - 1), searching: Math.max(0, counts.searching - (inQueue ? 1 : 0)) };
}
