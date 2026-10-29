"use client";

import { type CSSProperties, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { agoShort } from "@/lib/format";
import { intentInfo } from "@/lib/models";
import type { DiscoverCard as Card } from "@/stores/discover";

/** "Active now", "Active 3h ago", "Active 2d ago". */
export function activeLabel(c: Pick<Card, "online" | "lastSeenAt">): string {
  if (c.online) return "Active now";
  if (!c.lastSeenAt) return "";
  const s = agoShort(c.lastSeenAt);
  return s === "now" ? "Active now" : `Active ${s} ago`;
}

/**
 * One person in the deck: their photo full-bleed, name and age, where they
 * are, what they're here for, their bio and interests (the ones you share
 * first). Stamps show while dragging (`drag` −1…1 sideways, `up` 0…1).
 */
export function DiscoverCardView({ c, drag = 0, up = 0, className, style }: { c: Card; drag?: number; up?: number; className?: string; style?: CSSProperties }) {
  const p = c.profile;
  const [failed, setFailed] = useState(false);
  const shared = new Set(c.sharedInterests);
  const interests = [...p.interests].sort((a, b) => Number(shared.has(b)) - Number(shared.has(a))).slice(0, 5);
  const active = activeLabel(c);
  return (
    <article
      aria-label={`${p.name}${p.age ? `, ${p.age}` : ""}`}
      className={cn("relative isolate h-full w-full overflow-hidden rounded-[28px] border border-line bg-surface select-none", className)}
      style={style}
    >
      {p.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatarUrl} alt="" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <span aria-hidden className="bg-brand type-display absolute inset-0 -z-10 flex items-center justify-center text-[120px] text-white/35">
          {p.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[62%] bg-gradient-to-t from-black/92 via-black/55 to-transparent" />

      {c.superLikedMe ? (
        <span className="type-label absolute top-4 left-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-violet px-3 text-[12.5px] font-semibold text-white shadow-lg">
          <Icon name="star" variant="filled" size={16} /> Super Liked you
        </span>
      ) : null}
      {c.online ? (
        <span className="type-label absolute top-4 right-4 inline-flex h-7 items-center gap-1.5 rounded-full bg-black/45 px-2.5 text-[12px] font-semibold text-white backdrop-blur-md">
          <span className="size-2 rounded-full bg-ok" /> Online
        </span>
      ) : null}

      {/* Stamps while dragging. */}
      <span
        aria-hidden
        className="type-title absolute top-10 left-6 -rotate-12 rounded-[10px] border-[3px] border-ok px-3 py-1 text-[30px] font-bold tracking-wide text-ok"
        style={{ opacity: Math.max(0, Math.min(1, drag * 1.6)) }}
      >
        LIKE
      </span>
      <span
        aria-hidden
        className="type-title absolute top-10 right-6 rotate-12 rounded-[10px] border-[3px] border-bad px-3 py-1 text-[30px] font-bold tracking-wide text-bad"
        style={{ opacity: Math.max(0, Math.min(1, -drag * 1.6)) }}
      >
        NOPE
      </span>
      <span
        aria-hidden
        className="type-title absolute bottom-[45%] left-1/2 -translate-x-1/2 rounded-[10px] border-[3px] border-lavender px-3 py-1 text-[26px] font-bold tracking-wide text-lavender"
        style={{ opacity: Math.max(0, Math.min(1, up * 1.6)) }}
      >
        SUPER LIKE
      </span>

      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <div className="flex items-center gap-2">
          <h2 className="type-title-lg truncate text-[30px] leading-tight font-bold">
            {p.name.split(" ")[0]}
            {p.age ? <span className="font-normal">, {p.age}</span> : null}
          </h2>
          {p.verified ? <Icon name="verified" variant="filled" size={22} className="shrink-0 text-trust" label="Verified" /> : null}
        </div>
        <p className="type-body mt-0.5 text-[13.5px] text-white/80">
          {p.country.flag} {p.country.name}
          {active ? ` · ${active}` : ""}
        </p>
        {p.bio ? <p className="type-body mt-2.5 line-clamp-3 text-[14.5px] leading-[1.45] text-white/95">{p.bio}</p> : null}
        {p.intent || interests.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.intent ? (
              <span className="type-label inline-flex h-7 items-center gap-1 rounded-full border border-pink/50 bg-pink/22 px-2.5 text-[12px] font-semibold">
                <Icon name={intentInfo[p.intent].icon} size={14} /> {intentInfo[p.intent].label}
              </span>
            ) : null}
            {interests.map((i) => (
              <span key={i} className={cn("type-label inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold", shared.has(i) ? "bg-white text-bg" : "bg-white/14")}>
                {i}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
