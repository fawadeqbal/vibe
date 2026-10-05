import { useId, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The Vibe logo / app icon (option 1b): two white rings — two people, one
 * call — on the pink→violet tile. Same artwork as app/icon.svg and the
 * Flutter `VibeLogo`.
 */
export function VibeLogo({ size = 72, shadow = true, className }: { size?: number; shadow?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      role="img"
      aria-label="Vibe"
      className={cn("shrink-0", className)}
      style={shadow ? { borderRadius: size * (56 / 240), boxShadow: `0 ${size * 0.1}px ${size * 0.25 * 1.1547 + 1}px rgb(255 61 143 / .35)` } : undefined}
    >
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

/**
 * The brand mark: two rings meeting (pink, violet). With `animate` the rings
 * drift apart and back together — the search loader.
 */
export function VibeMark({ size = 72, animate = false, stroke = 0.092 }: { size?: number; animate?: boolean; stroke?: number }) {
  const ring = size * 0.62;
  const ringStyle = (side: "left" | "right", c: string): CSSProperties => ({
    position: "absolute",
    top: (size - ring) / 2,
    [side]: size * 0.06,
    width: ring,
    height: ring,
    borderRadius: "50%",
    border: `${size * stroke}px solid ${c}`,
    ...(animate
      ? ({ "--drift": `${side === "left" ? -size * 0.07 : size * 0.07}px`, animation: "vibe-drift 1.8s ease-in-out infinite alternate" } as CSSProperties)
      : {}),
  });
  return (
    <span role="img" aria-label="Vibe" className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span style={ringStyle("left", "var(--color-pink)")} />
      <span style={ringStyle("right", "var(--color-violet)")} />
    </span>
  );
}

/** Breathing rings around something (checkout waiting). */
export function PulseRings({ children, size = 220, color = "var(--color-pink)", active = true }: { children: ReactNode; size?: number; color?: string; active?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {active
        ? [0, 0.33, 0.66].map((phase) => (
            <span
              key={phase}
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${color}`, animation: "vibe-pulse-ring 2.4s linear infinite", animationDelay: `${-phase * 2.4}s`, opacity: 0 }}
            />
          ))
        : null}
      <span className="relative">{children}</span>
    </span>
  );
}

/** Top/bottom scrims that keep text legible over video without dimming the picture. */
export function VideoScrims({ top = 200, bottom = 500, topAlpha = 0.78, bottomAlpha = 0.97, bottomMid = 0.82 }: { top?: number; bottom?: number; topAlpha?: number; bottomAlpha?: number; bottomMid?: number }) {
  const bg = (a: number) => `rgb(11 10 16 / ${a})`;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-x-0 top-0" style={{ height: top, backgroundImage: `linear-gradient(to bottom, ${bg(topAlpha)}, ${bg(0)})` }} />
      <div className="absolute inset-x-0 bottom-0" style={{ height: bottom, backgroundImage: `linear-gradient(to top, ${bg(bottomAlpha)} 0%, ${bg(bottomMid)} 45%, ${bg(0)} 100%)` }} />
    </div>
  );
}
