"use client";

import { VideoView } from "@/components/shared/video-view";
import { useMatch } from "@/stores/match";

/** Your own camera as a full-bleed background (lobby, searching); a violet glow when it's off. */
export function SelfVideo({ blur = 0 }: { blur?: number }) {
  const stream = useMatch((s) => s.localStream);
  const camOn = useMatch((s) => s.camOn);
  const front = useMatch((s) => s.frontCamera);
  if (stream && camOn) return <VideoView stream={stream} mirror={front} blur={blur} />;
  return (
    <div
      className="absolute inset-0"
      style={{
        background: "radial-gradient(circle calc(1.1 * min(100vw, 100dvh)) at 50% 32.5%, #3A1D5C 0%, #1A1030 50%, #0B0A10 100%)",
        filter: blur ? `blur(${blur}px)` : undefined,
      }}
    />
  );
}
