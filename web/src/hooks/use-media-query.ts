"use client";

import { useSyncExternalStore } from "react";

/** True while the media query matches (false on the server). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The desktop layout (side rail, centred dialogs) starts here. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
