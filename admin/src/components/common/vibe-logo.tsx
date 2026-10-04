import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The Vibe logo / app icon (option 1b): two white rings — two people, one call —
 * on the pink→violet gradient tile. Same artwork as `app/icon.svg` and the
 * mobile launcher icons. Size it with a `size-*` class (defaults to 28px).
 */
export function VibeLogo({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 240 240" className={cn("size-7 shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF3D8F" />
          <stop offset=".52" stopColor="#B14BC9" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <radialGradient id={`${id}h`} cx="70" cy="60" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".7" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <rect width="240" height="240" rx="56" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="240" height="240" fill={`url(#${id}g)`} />
        <rect width="240" height="240" fill={`url(#${id}h)`} />
        <circle cx="94" cy="120" r="42" fill="none" stroke="#fff" strokeWidth="14" />
        <circle cx="146" cy="120" r="42" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="14" />
      </g>
    </svg>
  );
}
