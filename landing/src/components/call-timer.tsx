"use client";

import { useEffect, useState } from "react";

/** The call clock in the hero phone: starts at 01:24 and keeps running. */
export function CallTimer({ start = 84 }: { start?: number }) {
  const [s, setS] = useState(start);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className="text-[11px] font-semibold tabular-nums">
      {mm}:{ss}
    </span>
  );
}
