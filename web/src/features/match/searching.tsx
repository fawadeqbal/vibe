"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { VibeMark } from "@/components/ui/brand";
import { GhostButton, TextButton } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { thousands, until } from "@/lib/format";
import type { MatchFilters } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useMatch } from "@/stores/match";
import { toast } from "@/stores/ui";
import { useWaitlist } from "@/stores/waitlist";
import { isBoosted, isVip, useWallet } from "@/stores/wallet";

import { countryLabel, genderFilterLabel, isNarrowed, searchClock } from "./labels";
import { SelfVideo } from "./self-video";
import { type Availability, useAvailability } from "./use-availability";
import { confirmBoost } from "./use-match-actions";

/** After this long without a match, say why and offer a way forward. */
export const SLOW_SEARCH_SECONDS = 15;

/**
 * The brand's two rings become the loader. Around it: how long you've been
 * waiting, who else is looking, and — when it's slow — why, and what would
 * help (widen the filters, or just wait for the evening rush).
 */
export function Searching({ onRestart }: { onRestart: () => void }) {
  const wallet = useWallet((s) => s.wallet);
  const filters = useMatch((s) => s.filters);
  const autoBlur = useMatch((s) => s.autoBlur);
  const boostCost = useCatalog((s) => s.economy.boostCost);
  const boosted = isBoosted(wallet);
  const blurNote = autoBlur && !isVip(wallet);
  const availability = useAvailability({ inQueue: true, everyMs: 8_000 });
  const [startedAt] = useState(() => Date.now());
  const now = useNow(1000);
  const seconds = Math.max(0, (now - startedAt) / 1000);
  const nobodyAround = availability != null && availability.online === 0;
  const slow = seconds >= SLOW_SEARCH_SECONDS || (nobodyAround && seconds >= 4);

  return (
    <div className="absolute inset-0">
      <SelfVideo blur={28} />
      <div className="absolute inset-0 bg-bg/62" />
      <div className="absolute inset-0 flex flex-col overflow-y-auto px-6 pt-[env(safe-area-inset-top)] pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center">
          <div className="min-h-4 flex-1" />
          <div className="relative flex size-52 shrink-0 items-center justify-center sm:size-60">
            <span className="absolute inset-0 rounded-full border border-white/6" />
            <span className="absolute inset-9 rounded-full border border-white/9" />
            <VibeMark size={110} animate stroke={0.075} />
          </div>
          <div className="mt-5" aria-live="polite">
            {boosted ? (
              <Headline as="h2" text="Boosted · finding someone " accent="fast" size={28} align="center" />
            ) : (
              <Headline as="h2" text="Finding someone " accent="for you" size={28} align="center" />
            )}
          </div>
          <SearchStatus seconds={seconds} availability={availability} />
          <SearchSteps />
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <MiniChip label={genderFilterLabel[filters.gender]} />
            <MiniChip label={countryLabel(filters.countryCode)} />
            {filters.safeMode ? <MiniChip label="Verified only" trust /> : null}
          </div>
          <div className="min-h-6 flex-1" />

          {slow ? (
            <SlowSearchCard filters={filters} nobodyAround={nobodyAround} onRestart={onRestart} />
          ) : (
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
          )}
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

/** "0:12 · 38 others looking right now" — the wait is visible, and so is the crowd. */
function SearchStatus({ seconds, availability }: { seconds: number; availability: Availability | null }) {
  const crowd =
    availability == null
      ? null
      : availability.searching > 0
        ? `${thousands(availability.searching)} ${availability.searching === 1 ? "other person" : "others"} looking right now`
        : availability.online > 0
          ? `${thousands(availability.online)} online · you're first in line`
          : "No one else is on yet";
  return (
    <p className="mt-2 flex items-center justify-center text-text2">
      <span
        className="type-mono rounded-[8px] bg-white/8 px-1.5 py-0.5 text-[12px] text-text tabular-nums"
        aria-label={`Searching for ${Math.floor(seconds)} seconds`}
      >
        {searchClock(seconds)}
      </span>
      {crowd ? <span className="type-body ml-2 text-[13px]">{crowd}</span> : null}
    </p>
  );
}

/** Where you are in getting matched: in the queue → finding someone → connecting video. */
function SearchSteps() {
  const steps = ["In the queue", "Finding a match", "Connecting video"];
  const active = 1;
  return (
    <ol className="mt-4 flex items-center" aria-label="Matching progress">
      {steps.map((label, i) => {
        const done = i < active;
        const on = i === active;
        return (
          <li key={label} className="flex items-center" aria-current={on ? "step" : undefined}>
            {i > 0 ? <span className={cn("mx-1.5 h-px w-3 sm:mx-2 sm:w-5", done || on ? "bg-pink/60" : "bg-white/14")} /> : null}
            <span
              className={cn(
                "flex size-[18px] items-center justify-center rounded-full",
                done ? "bg-pink" : on ? "border-[1.5px] border-pink" : "border-[1.5px] border-white/20",
              )}
            >
              {done ? <Icon name="check" size={12} className="text-white" /> : on ? <span className="size-1.5 animate-pulse rounded-full bg-pink" /> : null}
            </span>
            <span className={cn("type-label ml-1.5 text-[11.5px] whitespace-nowrap", done ? "text-text2" : on ? "text-text" : "text-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Takes the safety card's place once the wait gets long: the likely reason and one useful action. */
function SlowSearchCard({ filters, nobodyAround, onRestart }: { filters: MatchFilters; nobodyAround: boolean; onRestart: () => void }) {
  const router = useRouter();
  const narrowed = isNarrowed(filters);
  if (narrowed) {
    const dropped = [
      filters.gender !== "anyone" ? genderFilterLabel[filters.gender].toLowerCase() + " only" : null,
      filters.countryCode ? countryLabel(filters.countryCode) : null,
      filters.safeMode ? "verified only" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <div role="status" className="w-full">
        <Glass radius={22} className="w-full border-warn/30 bg-bg2/70 p-4">
          <div className="flex items-start">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-warn/14">
              <Icon name="tune" size={20} className="text-warn" />
            </span>
            <span className="ml-3.5 flex-1">
              <span className="type-title block text-[14px] font-semibold">Few people match your filters</span>
              <span className="type-body mt-[3px] block text-[12.5px] leading-[1.45] text-text2">
                You&apos;re searching for {dropped}. Widening to anyone, anywhere usually finds someone in seconds.
              </span>
            </span>
          </div>
          <div className="mt-1.5 flex justify-end gap-1">
            <TextButton
              icon="public"
              onClick={() => {
                const m = useMatch.getState();
                m.stop();
                m.setFilters({ gender: "anyone", countryCode: null, safeMode: false });
                onRestart();
              }}
            >
              Match with anyone
            </TextButton>
          </div>
        </Glass>
      </div>
    );
  }
  return (
    <div role="status" className="w-full">
      <Glass radius={22} className="w-full border-white/10 bg-bg2/70 p-4">
        <div className="flex items-start">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white/8">
            <Icon name="hourglass_top" size={20} className="text-lavender" />
          </span>
          <span className="ml-3.5 flex-1">
            <span className="type-title block text-[14px] font-semibold">{nobodyAround ? "It's quiet right now" : "Taking a little longer"}</span>
            <span className="type-body mt-[3px] block text-[12.5px] leading-[1.45] text-text2">
              Stay here and we&apos;ll connect you the moment someone joins. Or leave, and we&apos;ll tell you when someone starts looking.
            </span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap justify-end gap-1">
          <TextButton
            icon="notifications_active"
            onClick={async () => {
              const ok = await useWaitlist.getState().notifyMe();
              useMatch.getState().stop();
              toast(ok ? "We'll tell you when someone starts looking" : "Couldn't set that up. Try again.", { error: !ok });
            }}
          >
            Notify me instead
          </TextButton>
          <TextButton
            icon="person_add"
            onClick={() => {
              useMatch.getState().stop();
              router.push("/invite");
            }}
          >
            Invite a friend
          </TextButton>
        </div>
      </Glass>
    </div>
  );
}

function MiniChip({ label, trust = false }: { label: string; trust?: boolean }) {
  return (
    <span
      className={cn(
        "type-label flex h-7 items-center rounded-[14px] px-2.5 text-[12px] font-medium",
        trust ? "bg-trust/12 text-trust" : "bg-white/8 text-text2",
      )}
    >
      {label}
    </span>
  );
}
