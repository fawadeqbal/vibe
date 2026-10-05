"use client";

import { VibeMark } from "@/components/ui/brand";
import { GhostButton } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { until } from "@/lib/format";
import { useCatalog } from "@/stores/catalog";
import { useMatch } from "@/stores/match";
import { isBoosted, isVip, useWallet } from "@/stores/wallet";

import { countryLabel, genderFilterLabel } from "./labels";
import { SelfVideo } from "./self-video";
import { confirmBoost } from "./use-match-actions";

/** The brand's two rings become the loader; the wait sets expectations about blur and reporting. */
export function Searching() {
  const wallet = useWallet((s) => s.wallet);
  const filters = useMatch((s) => s.filters);
  const autoBlur = useMatch((s) => s.autoBlur);
  const boostCost = useCatalog((s) => s.economy.boostCost);
  const boosted = isBoosted(wallet);
  const blurNote = autoBlur && !isVip(wallet);

  return (
    <div className="absolute inset-0">
      <SelfVideo blur={28} />
      <div className="absolute inset-0 bg-bg/62" />
      <div className="absolute inset-0 flex flex-col px-6 pt-[env(safe-area-inset-top)] pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center">
          <div className="flex-1" />
          <div className="relative flex size-60 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-white/6" />
            <span className="absolute inset-9 rounded-full border border-white/9" />
            <VibeMark size={120} animate stroke={0.075} />
          </div>
          <div className="mt-5" aria-live="polite">
            {boosted ? <Headline as="h2" text="Boosted · finding someone " accent="fast" size={28} align="center" /> : <Headline as="h2" text="Finding someone " accent="for you" size={28} align="center" />}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <MiniChip label={genderFilterLabel[filters.gender]} />
            <MiniChip label={countryLabel(filters.countryCode)} />
            {filters.safeMode ? <MiniChip label="Verified only" trust /> : null}
          </div>
          <div className="flex-1" />

          <Glass radius={22} className="flex w-full items-start border-white/10 bg-bg2/55 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-trust/14">
              <Icon name="shield" size={20} className="text-trust" />
            </span>
            <span className="ml-3.5 flex-1">
              <span className="type-title block text-[14px] font-semibold">{blurNote ? "Both videos start blurred" : "Report is one tap away"}</span>
              <span className="type-body mt-[3px] block text-[12.5px] leading-[1.45] text-text2">
                {blurNote
                  ? "The first 3 seconds stay soft. Report and block are always top-right, one tap away."
                  : "Report and block are always top-right. Turn on blur in Safety if you want a softer start."}
              </span>
            </span>
          </Glass>
          <div className="mt-4 w-full">
            <GhostButton label="Cancel" expand className="bg-white/8" onClick={() => useMatch.getState().stop()} />
          </div>
          <div className="mt-3.5">
            {boosted ? (
              <span className="flex items-center justify-center">
                <Icon name="bolt" size={15} className="text-gold" />
                <span className="type-label ml-1.5 text-[12.5px] font-medium text-text2">Boosted · {until(wallet.boostUntil!)}</span>
              </span>
            ) : (
              <button type="button" onClick={() => void confirmBoost()} className="flex items-center justify-center py-1.5">
                <Icon name="bolt" size={15} className="text-gold" />
                <span className="type-label ml-1.5 text-[12.5px] font-medium whitespace-pre text-text2">Boost to the front of the queue · </span>
                <span className="type-label text-[12.5px] text-gold">{boostCost}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniChip({ label, trust = false }: { label: string; trust?: boolean }) {
  return <span className={cn("type-label flex h-7 items-center rounded-[14px] px-2.5 text-[12px] font-medium", trust ? "bg-trust/12 text-trust" : "bg-white/8 text-text2")}>{label}</span>;
}
