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
 * ended. Your own camera fills the lobby; during a match the partner takes
 * the stage and you shrink to a corner.
 */
export function MatchScreen() {
  const status = useMatch((s) => s.status);
  const hasLast = useMatch((s) => s.lastPartner != null);
  const chat = useMatch((s) => s.chat);
  const [burst, setBurst] = useState<{ gift: Gift; received: boolean; seq: number } | null>(null);
  const seen = useRef(0);
  const actions = useMatchActions((g) => setBurst((b) => ({ gift: g, received: false, seq: (b?.seq ?? 0) + 1 })));

  // Warm the camera so the lobby shows you straight away.
  useEffect(() => {
    void useMatch.getState().ensureCamera();
  }, []);

  // A new incoming gift → burst.
  useEffect(() => {
    if (chat.length < seen.current) seen.current = 0;
    const fresh = chat.slice(seen.current).filter((c) => !c.fromMe && c.gift);
    seen.current = chat.length;
    const g = fresh.at(-1)?.gift;
    if (g) setBurst((b) => ({ gift: g, received: true, seq: (b?.seq ?? 0) + 1 }));
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
          <GiftBurst gift={burst.gift} received={burst.received} />
        </div>
      ) : null}
    </div>
  );
}
