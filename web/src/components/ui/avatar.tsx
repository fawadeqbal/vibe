"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

/**
 * A round photo with an initials fallback (shown while loading and on
 * error). `ring` draws the brand ring with a dark gap, as on the recap.
 */
export function Avatar({
  url,
  name,
  size = 48,
  ring = false,
  gapColor = "var(--color-bg)",
  blur = 0,
  border,
  className,
}: {
  url: string;
  name: string;
  size?: number;
  ring?: boolean;
  gapColor?: string;
  blur?: number;
  /** 1.5px hairline colour around the photo. */
  border?: string;
  className?: string;
}) {
  if (!ring) {
    const photo = <Photo url={url} name={name} size={size} blur={blur} />;
    if (!border) return <span className={cn("inline-flex shrink-0", className)}>{photo}</span>;
    return (
      <span className={cn("relative inline-flex shrink-0", className)}>
        {photo}
        <span className="pointer-events-none absolute inset-0 rounded-full" style={{ border: `1.5px solid ${border}` }} />
      </span>
    );
  }
  const ringW = size >= 80 ? 3 : 2.5;
  const gapW = size >= 80 ? 3 : 2;
  return (
    <span className={cn("bg-brand inline-flex shrink-0 rounded-full", className)} style={{ width: size, height: size, padding: ringW }}>
      <span className="inline-flex rounded-full" style={{ padding: gapW, backgroundColor: gapColor }}>
        <Photo url={url} name={name} size={size - 2 * (ringW + gapW)} blur={blur} />
      </span>
    </span>
  );
}

function Photo({ url, name, size, blur }: { url: string; name: string; size: number; blur: number }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const initial = name.trim() ? name.trim()[0].toUpperCase() : "?";
  const showImg = !!url && failed !== url;
  return (
    <span className="relative inline-flex shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
      {loaded !== url || !showImg ? (
        <span className="bg-brand type-title-lg absolute inset-0 flex items-center justify-center text-white" style={{ fontSize: size * 0.42, letterSpacing: size * 0.42 >= 20 ? "-0.03em" : "-0.012em" }}>
          {initial}
        </span>
      ) : null}
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(url)}
          onError={() => setFailed(url)}
          className={cn("absolute inset-0 size-full object-cover", loaded === url ? "opacity-100" : "opacity-0")}
          style={blur ? { filter: `blur(${blur}px)`, transform: "scale(1.08)" } : undefined}
        />
      ) : null}
    </span>
  );
}

/** Overlapping blurred faces — the "N people liked you" teaser. */
export function FaceStack({ urls, size = 34, overlap = 10, blur = 2.5, borderColor = "var(--color-surface)" }: { urls: string[]; size?: number; overlap?: number; blur?: number; borderColor?: string }) {
  if (!urls.length) return null;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size + (urls.length - 1) * (size - overlap), height: size }}>
      {urls.map((u, i) => (
        <span key={i} className="absolute top-0 flex items-center justify-center rounded-full" style={{ left: i * (size - overlap), width: size, height: size, border: `2px solid ${borderColor}` }}>
          <Avatar url={u} name="?" size={size - 4} blur={blur} />
        </span>
      ))}
    </span>
  );
}
