"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CoinAmount, CoinChip, GemIcon } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { thousands } from "@/lib/format";
import type { Gift } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { openSheet } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

/**
 * Pick a gift, then send — no accidental spend from one tap. Resolves with the
 * gift, or undefined. The caller pays; out-of-reach gifts are locked and the
 * button offers the store instead.
 */
export const pickGift = (toName: string) => openSheet<Gift>((close) => <GiftSheet toName={toName} onPick={close} />);

function GiftSheet({ toName, onPick }: { toName: string; onPick: (g?: Gift) => void }) {
  const router = useRouter();
  const coins = useWallet((s) => s.wallet.coins);
  const gifts = useCatalog((s) => s.gifts);
  const share = useCatalog((s) => s.economy.giftGemShare);
  const [picked, setPicked] = useState<Gift | null>(null);
  const canAfford = !!picked && coins >= picked.coins;

  const openStore = () => {
    onPick(undefined);
    router.push("/store");
  };

  return (
    <div className="px-5 pt-2.5 pb-5">
      <div className="flex items-start">
        <div className="min-w-0 flex-1">
          <h2 className="type-title-lg text-[22px]">Send {toName} a gift</h2>
          <div className="mt-1 flex items-start">
            <GemIcon size={14} className="mt-px" />
            <p className="type-body ml-[5px] flex-1 text-[12.5px] leading-[1.35] text-text2">They keep {Math.round(share * 100)}% as gems they can cash out.</p>
          </div>
        </div>
        <span className="ml-3">
          <CoinChip coins={coins} onClick={openStore} />
        </span>
      </div>

      <div className="mt-[18px] grid grid-cols-3 gap-2.5">
        {gifts.map((g) => (
          <GiftTile key={g.id} gift={g} selected={g.id === picked?.id} locked={coins < g.coins} onClick={() => setPicked(g)} />
        ))}
      </div>

      <div className="mt-[18px]">
        {picked && !canAfford ? (
          <GradientButton label={`Get coins for ${picked.name}`} icon="add" tone="gold" onClick={openStore} />
        ) : (
          <GradientButton
            label={picked ? `Send ${picked.name}` : "Pick a gift"}
            onClick={picked ? () => onPick(picked) : undefined}
            trailing={
              picked ? (
                <span className="flex h-[26px] items-center rounded-[13px] bg-black/22 px-[9px]">
                  <CoinAmount amount={picked.coins} size={13} className="text-white" />
                </span>
              ) : undefined
            }
          />
        )}
      </div>
      <p className="type-body mt-2.5 text-center text-[12px] text-muted">
        {!picked ? `You have ${thousands(coins)} coins` : canAfford ? `${thousands(coins - picked.coins)} coins left after this gift` : `${thousands(picked.coins - coins)} more coins needed`}
      </p>
    </div>
  );
}

function GiftTile({ gift, selected, locked, onClick }: { gift: Gift; selected: boolean; locked: boolean; onClick: () => void }) {
  const dim = locked && !selected;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${gift.name}, ${gift.coins} coins${locked ? ", not enough coins" : ""}`}
      className={cn("aspect-[0.92] rounded-[20px] transition-[padding] duration-150", selected ? "bg-brand p-[1.5px]" : "bg-white/6 p-px")}
    >
      <span className={cn("relative flex size-full flex-col items-center justify-center rounded-[18.5px]", selected ? "bg-surface-sel" : "bg-surface2")}>
        <span className={cn("flex size-14 items-center justify-center rounded-full", selected ? "bg-white/6" : "bg-white/4")}>
          <span className={cn("text-[32px] leading-none", dim && "opacity-45")}>{gift.emoji}</span>
        </span>
        <span className={cn("type-title mt-2 text-[13px] font-semibold", dim ? "text-muted" : "text-text")}>{gift.name}</span>
        <CoinAmount amount={gift.coins} size={12} locked={locked} className="mt-1.5" />
        {selected ? (
          <span className="bg-brand absolute top-2 right-2 flex size-5 items-center justify-center rounded-full">
            <Icon name="check" size={14} className="text-white" />
          </span>
        ) : null}
      </span>
    </button>
  );
}
