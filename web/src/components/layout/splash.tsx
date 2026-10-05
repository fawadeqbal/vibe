"use client";

import { type CSSProperties, useEffect, useState } from "react";

const SPRING = "cubic-bezier(0.16, 1, 0.3, 1)";
const RIPPLE = "cubic-bezier(0, 0.4, 0.4, 1)";

/**
 * Cold-start splash — "dark minimal" from the splash handoff, the same motion
 * as the Flutter `SplashScreen`: the two rings slide in and lock, the wordmark
 * rises, then the mark breathes with sonar ripples until the app is ready.
 * Sizes scale from the 412px-wide reference (0.85–1.2).
 */
export function Splash() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const fit = () => setS(Math.min(1.2, Math.max(0.85, window.innerWidth / 412)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const ring = (left: number, colour: string, start: number, side: "left" | "right"): CSSProperties => ({
    position: "absolute",
    left: (left - 37) * s,
    top: (56 - 37) * s,
    width: 74 * s,
    height: 74 * s,
    borderRadius: "50%",
    border: `${10 * s}px solid ${colour}`,
    boxShadow: `0 0 ${34 * s}px color-mix(in srgb, ${colour} 50%, transparent)`,
    mixBlendMode: side === "right" ? "screen" : undefined,
    opacity: 0,
    animation: `splash-ring-in-${side} 0.7s ${SPRING} ${start}s both, splash-fade 0.42s ${SPRING} ${start}s forwards`,
  });

  const ripple = (colour: string, delay: number): CSSProperties => ({
    position: "absolute",
    inset: 0.75 * s,
    borderRadius: "50%",
    border: `${1.5 * s}px solid ${colour}`,
    opacity: 0,
    animation: `splash-ripple-scale 3s ${RIPPLE} ${delay}s infinite, splash-ripple-fade 3s ${RIPPLE} ${delay}s infinite`,
  });

  return (
    <div
      role="status"
      aria-label="Vibe is starting"
      className="fixed inset-0 z-[60] flex flex-col items-center overflow-hidden"
      style={{ background: "radial-gradient(120% 90% at 50% 30%, #1B0F2E 0%, #0B0A10 62%)" }}
    >
      {/* Violet glow behind the mark, breathing with it. */}
      <div
        className="pointer-events-none absolute left-1/2 rounded-full"
        style={{
          width: 360 * s,
          height: 360 * s,
          top: `calc(34% - ${180 * s}px)`,
          transform: "translateX(-50%)",
          background: "radial-gradient(closest-side, rgb(139 92 246 / .14), rgb(139 92 246 / 0) 65%)",
          opacity: 0.55,
          animation: "splash-glow 3s ease-in-out 1.6s infinite",
        }}
      />
      <div className="flex-1" />
      <div className="relative" style={{ width: 220 * s, height: 220 * s }}>
        <div className="absolute inset-0" aria-hidden>
          <span style={ripple("rgb(255 61 143)", 1.6)} />
          <span style={ripple("rgb(139 92 246)", 3.1)} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center" style={{ animation: "splash-breathe 3s ease-in-out 1.6s infinite" }}>
          <div className="relative isolate" style={{ width: 112 * s, height: 112 * s }}>
            <span style={ring(37, "#FF3D8F", 0.15, "left")} />
            <span style={ring(75, "#8B5CF6", 0.3, "right")} />
          </div>
        </div>
      </div>
      <div style={{ height: 26 * s }} />
      <div className="font-bold text-text" style={{ fontSize: 36 * s, letterSpacing: -1.3 * s, lineHeight: 1.1, opacity: 0, animation: `splash-rise 0.6s ${SPRING} 0.75s forwards` }}>
        Vibe
      </div>
      <div style={{ height: 9 * s }} />
      <div className="text-muted" style={{ fontSize: 12.5 * s, letterSpacing: 1.8 * s, lineHeight: 1.2, opacity: 0, animation: `splash-rise 0.6s ${SPRING} 0.9s forwards` }}>
        MEET SOMEONE NEW
      </div>
      <div className="flex-1" />
      <div
        className="flex flex-col items-center"
        style={{ paddingBottom: `calc(${52 * s}px + max(0px, env(safe-area-inset-bottom) - 24px))`, opacity: 0, animation: "splash-fade 0.8s ease 1.2s forwards" }}
      >
        <div className="overflow-hidden rounded-[2px] bg-white/9" style={{ width: 128 * s, height: 3 * s }}>
          <div
            className="h-full rounded-[2px]"
            style={{
              width: 44 * s,
              background: "linear-gradient(90deg, rgb(255 61 143 / 0), #FF3D8F, #8B5CF6, rgb(139 92 246 / 0))",
              transform: "translateX(-120%)",
              animation: "splash-sweep 1.6s cubic-bezier(0.45, 0, 0.55, 1) 1.2s infinite",
            }}
          />
        </div>
        <div className="text-muted" style={{ marginTop: 14 * s, fontSize: 11 * s, lineHeight: 1.2 }}>
          18+ · be kind on camera
        </div>
      </div>
    </div>
  );
}
