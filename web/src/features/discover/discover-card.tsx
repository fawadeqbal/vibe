"use client";

import { type CSSProperties, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { Intent, Profile } from "@/lib/models";
import type { DiscoverCard as Card } from "@/stores/discover";

/** "Active now", "Active 3h ago", "Active 2d ago". */
export function activeLabel(c: Pick<Card, "online" | "lastSeenAt">): string {
  if (c.online) return "Active now";
  if (!c.lastSeenAt) return "";
  // "Active 5 min ago", "Active 3 hours ago", "Active 2 days ago", then "Active on 31 Oct".
  const m = Math.max(0, Math.floor((Date.now() - c.lastSeenAt.getTime()) / 60_000));
  if (m < 1) return "Active now";
  if (m < 60) return `Active ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Active ${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Active ${d} day${d === 1 ? "" : "s"} ago`;
  return `Active on ${c.lastSeenAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** What they're here for, as a short line: "Here for friends". */
export const INTENT_LINE: Record<Intent, string> = {
  chat: "Here to chat",
  friends: "Here for friends",
  dating: "Here for dating",
  open: "Not sure yet",
};

/** "Pakistan · Here for friends". */
export const placeLine = (p: Profile) => [p.country.name, p.intent ? INTENT_LINE[p.intent] : null].filter(Boolean).join(" · ");

/** Interests, the ones you share first. */
export const sortedInterests = (p: Profile, shared: string[]) => {
  const s = new Set(shared);
  return [...p.interests].sort((a, b) => Number(s.has(b)) - Number(s.has(a)));
};

/** One interest: shared ones are pink with a check. */
export function InterestChip({ label, shared, glass = true }: { label: string; shared: boolean; glass?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-[5px] rounded-full px-[11px] text-[12.5px] font-semibold text-white",
        shared ? "bg-pink/26" : glass ? "bg-white/14" : "bg-white/8",
        glass && "backdrop-blur-[12px]",
      )}
    >
      {shared ? <Icon name="check" size={13} /> : null}
      {label}
    </span>
  );
}

/**
 * One person in the deck: their photo full-bleed, Verified, then at the
 * bottom whether they're active, name and age (ⓘ opens the full profile),
 * where they are and what they're here for, their bio and interests (the
 * ones you share first). Stamps show while dragging (`drag` −1…1, `up` 0…1).
 */
export function DiscoverCardView({
  c,
  drag = 0,
  up = 0,
  className,
  style,
  onAnimationEnd,
  onInfo,
}: {
  c: Card;
  drag?: number;
  up?: number;
  className?: string;
  style?: CSSProperties;
  onAnimationEnd?: () => void;
  onInfo?: () => void;
}) {
  const p = c.profile;
  const [failed, setFailed] = useState(false);
  const shared = new Set(c.sharedInterests);
  const interests = sortedInterests(p, c.sharedInterests).slice(0, 4);
  const active = activeLabel(c);
  const first = p.name.split(" ")[0];
  return (
    <article
      aria-label={`${p.name}${p.age ? `, ${p.age}` : ""}`}
      className={cn("relative isolate h-full w-full overflow-hidden rounded-[28px] bg-surface shadow-[0_18px_40px_rgb(0_0_0/.45)] select-none", className)}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      {p.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.avatarUrl}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 -z-10 size-full object-cover"
          style={{ objectPosition: "center 30%" }}
        />
      ) : (
        <span aria-hidden className="bg-brand type-display absolute inset-0 -z-10 flex items-center justify-center text-[120px] text-white/35">
          {p.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[300px] max-h-[70%]" style={{ background: "linear-gradient(to top, rgb(11 10 16 / .95), rgb(11 10 16 / .55) 50%, rgb(11 10 16 / 0))" }} />

      {c.superLikedMe ? (
        <span className="absolute top-4 left-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-[#60a5fa] px-2.5 text-[12px] font-semibold text-white shadow-lg">
          <Icon name="star" variant="filled" size={15} /> Super Liked you
        </span>
      ) : null}
      {p.verified ? (
        <span className="absolute top-4 right-3 inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-bg2/52 px-2.5 text-[12px] font-semibold text-white backdrop-blur-[18px]">
          <Icon name="verified" size={15} className="text-trust" /> Verified
        </span>
      ) : null}

      {/* Stamps while dragging. */}
      <span
        aria-hidden
        className="absolute top-[60px] left-[22px] -rotate-[14deg] rounded-[12px] border-[3px] border-ok px-3.5 py-1.5 text-[30px] leading-none font-extrabold tracking-[1px] text-ok"
        style={{ opacity: Math.max(0, Math.min(1, drag * 1.6)) }}
      >
        LIKE
      </span>
      <span
        aria-hidden
        className="absolute top-[60px] right-[22px] rotate-[14deg] rounded-[12px] border-[3px] border-bad px-3.5 py-1.5 text-[30px] leading-none font-extrabold tracking-[1px] text-bad"
        style={{ opacity: Math.max(0, Math.min(1, -drag * 1.6)) }}
      >
        NOPE
      </span>
      <span
        aria-hidden
        className="absolute bottom-[48%] left-1/2 -translate-x-1/2 rounded-[12px] border-[3px] border-[#60a5fa] px-3.5 py-1.5 text-[26px] leading-none font-extrabold tracking-[1px] text-[#60a5fa]"
        style={{ opacity: Math.max(0, Math.min(1, up * 1.6)) }}
      >
        SUPER LIKE
      </span>

      <div className="absolute inset-x-[18px] bottom-[18px] flex flex-col gap-2 text-white">
        {active ? (
          <span className="flex items-center gap-1.5 text-[12.5px] text-white/85">
            <span className={cn("size-2 rounded-full", active === "Active now" ? "bg-ok" : "bg-white/40")} />
            {active}
          </span>
        ) : null}
        <div className="flex items-end gap-2">
          <h2 className="min-w-0 truncate text-[30px] leading-none font-bold tracking-[-0.035em]">
            {first}
            {p.age ? `, ${p.age}` : ""}
          </h2>
          <span className="flex-1" />
          {onInfo ? (
            <button
              type="button"
              aria-label={`More about ${first}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onInfo}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-white backdrop-blur-[18px] hover:brightness-125"
            >
              <Icon name="info" size={20} />
            </button>
          ) : null}
        </div>
        <span className="flex items-center gap-1.5 text-[13px] text-white/80">
          <Icon name="public" size={14} />
          {placeLine(p)}
        </span>
        {p.bio ? <p className="line-clamp-3 text-[14px] leading-[1.4]">{p.bio}</p> : null}
        {interests.length ? (
          <div className="flex flex-wrap gap-1.5">
            {interests.map((i) => (
              <InterestChip key={i} label={i} shared={shared.has(i)} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
