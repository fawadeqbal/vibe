"use client";

import { useEffect, useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { Headline } from "@/components/ui/typography";
import type { FriendState } from "@/lib/models";

/** How long "It's a vibe!" stays (a bit longer when it offers Add friend). */
const SHOW_MS = 2500;
const SHOW_WITH_CTA_MS = 4000;
/** Calls already celebrated (the call screen can mount again, e.g. after visiting Chats). */
const celebrated = new Set<string>();

/**
 * "It's a vibe!" — both liked each other. Rings burst behind the line for a
 * moment; Add friend is the in-call friend action (hidden once you're
 * friends or asked). Tap anywhere else to dismiss.
 */
export function MutualCelebration({ matchId, friendState, onAddFriend }: { matchId: string; friendState: FriendState; onAddFriend: () => void }) {
  const [shown, setShown] = useState(() => !celebrated.has(matchId));
  const cta = friendState === "none" || friendState === "incoming";
  useEffect(() => {
    celebrated.add(matchId);
    const t = setTimeout(() => setShown(false), cta ? SHOW_WITH_CTA_MS : SHOW_MS);
    return () => clearTimeout(t);
  }, [cta, matchId]);
  if (!shown) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/40 px-8" onClick={() => setShown(false)} role="status" aria-live="polite">
      <div className="relative flex flex-col items-center" style={{ animation: "vibe-pop 420ms var(--ease-spring) both" }}>
        <span className="pointer-events-none absolute top-1/2 left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2" aria-hidden>
          {[0, 0.25, 0.5].map((d, i) => (
            <span
              key={d}
              className="absolute inset-0 rounded-full"
              style={{ border: `3px solid ${i % 2 ? "var(--color-violet)" : "var(--color-pink)"}`, opacity: 0, animation: `vibe-burst-ring 1.4s ease-out ${d}s 2 both` }}
            />
          ))}
        </span>
        <Headline as="h2" text="It's a " accent="vibe!" size={40} align="center" className="relative [text-shadow:0_2px_18px_rgb(0_0_0/.5)]" />
        <p className="type-body relative mt-2 text-center text-[15px] text-white/88">You both liked each other</p>
        {cta ? (
          <div className="relative mt-5" onClick={(e) => e.stopPropagation()}>
            <GradientButton
              label={friendState === "incoming" ? "Accept friend" : "Add friend"}
              icon="person_add"
              height={48}
              expand={false}
              onClick={() => {
                setShown(false);
                onAddFriend();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
