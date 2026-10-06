"use client";

import { useEffect, useRef, useState } from "react";

import type { Gift } from "@/lib/models";
import { useMatch } from "@/stores/match";

import { Connected } from "./connected";
import { Ended } from "./ended";
import { GiftBurst } from "./gift-burst";
import { Lobby } from "./lobby";
import { Searching } from "./searching";
import { useMatchActions } from "./use-match-actions";

/**
 * The app. Four looks on one screen: lobby (idle), searching, connected,
 * ended. In the lobby your camera stays off until you tap to preview it; during a match the partner takes
 * the stage and you shrink to a corner.
 */
export function MatchScreen() {
  const status = useMatch((s) => s.status);
  const hasLast = useMatch((s) => s.lastPartner != null);
  const chat = useMatch((s) => s.chat);
  const [burst, setBurst] = useState<{ gift: Gift; received: boolean; bonusGems?: number; seq: number } | null>(null);
  const seen = useRef(0);
  const actions = useMatchActions((g) => setBurst((b) => ({ gift: g, received: false, seq: (b?.seq ?? 0) + 1 })));

  // The lobby camera may only run while this page is open (the store also
  // watches the tab's visibility). It is not opened here: the preview is
  // opt-in, see the camera rules in stores/match.ts.
  useEffect(() => {
    const m = useMatch.getState();
    m.setLobbyVisible(true);
    const touch = () => useMatch.getState().touchPreview();
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      useMatch.getState().setLobbyVisible(false);
    };
  }, []);

  // A new incoming gift → burst.
  useEffect(() => {
    if (chat.length < seen.current) seen.current = 0;
    const fresh = chat.slice(seen.current).filter((c) => !c.fromMe && c.gift);
    seen.current = chat.length;
    const last = fresh.at(-1);
    const g = last?.gift;
    if (g) setBurst((b) => ({ gift: g, received: true, bonusGems: last?.bonusGems, seq: (b?.seq ?? 0) + 1 }));
  }, [chat]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg lg:h-dvh">
      {status === "connected" ? (
        <Connected actions={{ next: () => void actions.next(), gift: () => void actions.gift(), addFriend: () => void actions.addFriend(), report: () => void actions.report() }} />
      ) : status === "searching" ? (
        <Searching />
      ) : status === "ended" && hasLast ? (
        <Ended onReconnect={() => void actions.reconnect()} onFindAnother={() => void actions.start()} onReport={() => void actions.reportLast()} />
      ) : (
        <Lobby onStart={() => void actions.start()} />
      )}
      {burst ? (
        <div key={`${burst.gift.id}-${burst.seq}`} className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <GiftBurst gift={burst.gift} received={burst.received} bonusGems={burst.bonusGems} />
        </div>
      ) : null}
    </div>
  );
}
