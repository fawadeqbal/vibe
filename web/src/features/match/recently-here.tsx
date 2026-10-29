"use client";

import { useEffect } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { agoShort } from "@/lib/format";
import { type RecentPerson, useWaves } from "@/stores/waves";

/**
 * Real people seen on Vibe in the last two days. Wave at someone and they
 * hear about it; when you're both looking, you're matched first. People
 * who waved at you come first. Hidden when nobody's been around.
 */
export function RecentlyHere({ className, tone = "glass" }: { className?: string; tone?: "glass" | "panel" }) {
  const recent = useWaves((s) => s.recent);
  const loaded = useWaves((s) => s.loaded);
  const unseen = useWaves((s) => s.unseen);

  // Fresh when the lobby opens, then every minute (who's online changes).
  useEffect(() => {
    void useWaves.getState().load();
    const t = setInterval(() => void useWaves.getState().load(), 60_000);
    return () => clearInterval(t);
  }, []);
  // Seeing the list counts as seeing your waves.
  useEffect(() => {
    if (unseen > 0) void useWaves.getState().markSeen();
  }, [unseen]);

  if (!loaded || !recent.length) return null;
  return (
    <section aria-labelledby="recently-here" className={cn("w-full", className)}>
      <div className="mb-2 flex items-baseline gap-2 px-0.5">
        <h2 id="recently-here" className={cn("type-overline shrink-0 whitespace-nowrap", tone === "glass" && "text-white/70")}>
          Recently here
        </h2>
        <span className={cn("type-body min-w-0 truncate text-[11.5px]", tone === "glass" ? "text-white/55" : "text-muted")}>Wave, and you&apos;re matched first when you&apos;re both on</span>
      </div>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {recent.map((p) => (
          <PersonCard key={p.profile.id} p={p} tone={tone} />
        ))}
      </ul>
    </section>
  );
}

function PersonCard({ p, tone }: { p: RecentPerson; tone: "glass" | "panel" }) {
  const { profile } = p;
  const first = profile.name.trim().split(/\s+/)[0] || "Someone";
  const label = p.iWaved ? "Waved" : p.wavedAtMe ? "Wave back" : "Wave";
  return (
    <li
      className={cn(
        "flex w-[104px] shrink-0 snap-start flex-col items-center rounded-[18px] border px-2 pt-3 pb-2 text-center",
        tone === "glass" ? "border-white/12 bg-bg2/55 backdrop-blur-[20px]" : "border-line bg-surface",
        p.wavedAtMe && !p.iWaved && "border-pink/45",
      )}
    >
      <span className="relative">
        <Avatar url={profile.avatarUrl} name={profile.name} size={52} />
        {p.online ? <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-bg2 bg-ok" aria-label="Online now" /> : null}
      </span>
      <span className="type-title mt-1.5 w-full truncate text-[13px] font-semibold">
        {first}
        {profile.age ? <span className="font-normal text-text2">, {profile.age}</span> : null}
      </span>
      <span className="type-body w-full truncate text-[11px] text-muted">
        {profile.country.flag} {p.wavedAtMe && !p.iWaved ? "waved at you" : p.online ? "online now" : p.lastSeenAt ? seenLabel(p.lastSeenAt) : ""}
      </span>
      <button
        type="button"
        disabled={p.iWaved}
        onClick={() => void useWaves.getState().wave(profile.id)}
        aria-label={p.iWaved ? `You waved at ${first}` : `${label} at ${first}`}
        className={cn(
          "type-label mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-full text-[12.5px] font-semibold transition-[filter]",
          p.iWaved ? "bg-white/8 text-text2" : p.wavedAtMe ? "bg-brand text-white hover:brightness-110" : "bg-white text-bg hover:brightness-90",
        )}
      >
        {p.iWaved ? <Icon name="check" size={14} /> : <span aria-hidden>👋</span>}
        {label}
      </button>
    </li>
  );
}

/** "just now", "5m ago", "3h ago". */
function seenLabel(t: Date): string {
  const s = agoShort(t);
  return s === "now" ? "just now" : `${s} ago`;
}
