"use client";

import { GlassPill } from "@/components/ui/glass";
import { giftGems } from "@/lib/catalog";
import type { Gift } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";

/** The floating "+20 🌹" moment when a gift is sent or received. */
export function GiftBurst({ gift, received }: { gift: Gift; received: boolean }) {
  const e = useCatalog((s) => s.economy);
  return (
    <div
      className="pointer-events-none flex flex-col items-center"
      style={{ animation: "vibe-burst-move 1.4s cubic-bezier(0.33, 1, 0.68, 1) forwards, vibe-burst-fade 1.4s linear forwards" }}
      aria-live="polite"
    >
      <span className="text-[72px] leading-[1.15]">{gift.emoji}</span>
      <span className="mt-1">
        <GlassPill
          height={34}
          fontSize={13.5}
          icon={received ? "diamond" : "redeem"}
          iconColor={received ? "gem" : "gold"}
          label={received ? `${gift.name} · +${giftGems(gift, e)} gems` : `Sent a ${gift.name}`}
        />
      </span>
    </div>
  );
}
