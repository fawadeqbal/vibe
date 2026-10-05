"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

/** A live MediaStream, covering its box (the app's RTCVideoView, objectFit cover). */
export function VideoView({ stream, mirror = false, muted = true, className, blur = 0 }: { stream: MediaStream; mirror?: boolean; muted?: boolean; className?: string; blur?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn("absolute inset-0 size-full object-cover", className)}
      style={{ transform: [mirror ? "scaleX(-1)" : "", blur ? "scale(1.1)" : ""].join(" ").trim() || undefined, filter: blur ? `blur(${blur}px)` : undefined }}
    />
  );
}
