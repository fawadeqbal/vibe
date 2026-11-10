"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Glass, RoundControl } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { CoinChip } from "@/components/ui/money";
import { useNow } from "@/hooks/use-now";
import { COUNTRIES } from "@/lib/catalog";
import { until } from "@/lib/format";
import { clock12, vibeHourLive } from "@/lib/engagement";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { filterSummary, freeOnly, useFilters, usesExtraFilters } from "@/stores/filters";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";
import { useWaitlist } from "@/stores/waitlist";
import { isBoosted, useWallet } from "@/stores/wallet";

import { toggleVibeHourReminder } from "@/features/engagement/vibe-hour-invite";

import { searchClock } from "./labels";
import { SelfVideo } from "./self-video";
import { useAvailability } from "./use-availability";
import { confirmBoost } from "./use-match-actions";

export const SLOW_SEARCH_SECONDS = 15;

const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

/**
 * Looking for someone: your own photo in the middle of soft rings, who
 * you're looking for, a tip, then Boost (go to the front) and Stop. When
 * nobody else is on, it says so plainly ("You're first in line") and offers
 * to tell you instead.
 */
export function Searching({ onRestart }: { onRestart: () => void }) {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  const me = useSession((s) => s.me);
  const filters = useFilters((s) => s.filters);
  const boostCost = useCatalog((s) => s.economy.boostCost);
  const boostMinutes = useCatalog((s) => s.economy.boostMinutes);
  const boosted = isBoosted(wallet);
  const availability = useAvailability({ inQueue: true, everyMs: 8_000 });
  const [startedAt] = useState(() => Date.now());
  const now = useNow(1000);
  const seconds = Math.max(0, (now - startedAt) / 1000);
  const quiet = availability != null && availability.online === 0 && seconds >= 4;
  const slow = !quiet && seconds >= SLOW_SEARCH_SECONDS;
  const stop = () => useMatch.getState().stop();

  return (
    <div className="absolute inset-0">
      <SelfVideo blur={28} />
      <div className="absolute inset-0 bg-bg/66" />
      <div className="absolute inset-0 mx-auto flex max-w-[560px] flex-col overflow-y-auto px-4 pt-[env(safe-area-inset-top)] pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 pt-3">
          <RoundControl icon="close" size={40} onClick={stop} ariaLabel="Stop looking" />
          <span className="flex-1" />
          <CoinChip coins={wallet.coins} glass showPlus={false} />
        </div>

        <div className="relative mx-auto mt-6 flex size-[300px] shrink-0 items-center justify-center" aria-hidden>
          {[150, 220, 300].map((d, i) => (
            <span
              key={d}
              className="absolute rounded-full border border-pink motion-safe:animate-pulse"
              style={{ width: d, height: d, opacity: [0.55, 0.32, 0.18][i], animationDelay: `${i * 0.4}s` }}
            />
          ))}
          <Avatar url={me?.avatarUrl ?? ""} name={me?.name ?? "You"} size={112} ring />
        </div>

        <div className="mt-2 text-center" aria-live="polite">
          <h2 className="type-display text-[26px]">
            {quiet ? (
              <>
                You&apos;re first <span className="type-serif text-[30px] text-pink-soft">in line</span>
              </>
            ) : boosted ? (
              <>
                Boosted · finding someone <span className="type-serif text-[30px] text-pink-soft">fast</span>
              </>
            ) : (
              <>
                Finding someone <span className="type-serif text-[30px] text-pink-soft">new</span>
              </>
            )}
          </h2>
          {quiet ? (
            <p className="type-body mx-auto mt-2 max-w-[330px] text-[14px] leading-[1.5] text-text2">It&apos;s quiet right now. Stay here and we&apos;ll connect you the moment someone starts looking.</p>
          ) : (
            <p className="type-body mt-1.5 text-[13.5px] text-text2">
              {filterSummary(filters, countryName)} · <span className="type-mono tabular-nums">{searchClock(seconds)}</span>
            </p>
          )}
        </div>

        <div className="mt-5">
          {quiet ? (
            <VibeHourNudge />
          ) : slow && usesExtraFilters(filters) ? (
            <Glass radius={18} className="flex items-center gap-2.5 bg-bg2/55 px-3.5 py-3">
              <Icon name="tune" size={20} className="shrink-0 text-warn" />
              <span className="type-body flex-1 text-[13px] leading-[1.45]">Your filters are narrow right now. Meet anyone to find someone sooner.</span>
              <button
                type="button"
                className="type-label shrink-0 text-[13px] text-pink-soft"
                onClick={() => {
                  stop();
                  void useFilters.getState().save(freeOnly(filters));
                  onRestart();
                }}
              >
                Meet anyone
              </button>
            </Glass>
          ) : (
            <Glass radius={18} className="flex items-center gap-2.5 bg-bg2/55 px-3.5 py-3">
              <Icon name="interests" size={20} className="shrink-0 text-lavender" />
              <span className="type-body text-[13px] leading-[1.45]">Tip: say hi first and ask about something in their profile.</span>
            </Glass>
          )}
        </div>

        <div className="min-h-6 flex-1" />

        <div className="flex flex-col gap-2.5">
          {quiet ? (
            <>
              <GradientButton
                label="Notify me instead"
                icon="notifications_active"
                height={54}
                onClick={async () => {
                  const ok = await useWaitlist.getState().notifyMe();
                  stop();
                  toast(ok ? "We'll tell you when someone starts looking" : "Couldn't set that up. Try again.", { error: !ok });
                }}
              />
              <GhostButton
                label="Invite a friend"
                icon="person_add"
                height={48}
                expand
                onClick={() => {
                  stop();
                  router.push("/invite");
                }}
              />
            </>
          ) : boosted ? (
            <p className="type-label flex items-center justify-center gap-1.5 text-[13px] text-text2">
              <Icon name="bolt" size={16} className="text-gold" />
              Boosted · {until(wallet.boostUntil!)}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void confirmBoost()}
              className="flex items-center gap-3 rounded-[22px] border border-gold/28 bg-gold/10 py-3 pr-3 pl-3.5 text-left transition-colors hover:bg-gold/14"
            >
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-gold/16">
                <Icon name="bolt" size={22} className="text-gold" />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="type-title text-[15px]">Go to the front</span>
                <span className="type-body text-[12px] text-text2">{wallet.freeBoosts > 0 ? "Use your free boost" : `Boost: ${boostMinutes} minutes first in line`}</span>
              </span>
              {wallet.freeBoosts > 0 ? (
                <span className="type-label rounded-full bg-ok/16 px-3 py-1.5 text-[13px] text-ok">Free</span>
              ) : (
                <span className="bg-gold-grad type-label flex h-9 items-center gap-1 rounded-full px-3.5 text-[13.5px] text-on-gold">
                  <Icon name="monetization_on" size={16} />
                  {boostCost}
                </span>
              )}
            </button>
          )}
          <GhostButton label="Stop" height={48} expand className={quiet ? "border-transparent bg-transparent" : undefined} onClick={stop} />
        </div>
      </div>
    </div>
  );
}


/** In a quiet search: when everyone's on, and one tap to be reminded. */
function VibeHourNudge() {
  const v = useEngagement((s) => s.vibeHour);
  const remind = useEngagement((s) => s.vibeHourReminder);
  if (!v?.startsAt || vibeHourLive(v)) return null;
  const startsAt = v.startsAt;
  return (
    <span className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <span className="type-body text-[12.5px] text-muted">
        Most people come at <span className="text-text">{clock12(startsAt)}</span> for Vibe Hour.
      </span>
      <button type="button" aria-pressed={remind} onClick={() => void toggleVibeHourReminder(!remind, startsAt)} className="type-label inline-flex items-center gap-1 text-[12.5px] text-pink-soft hover:underline">
        <Icon name={remind ? "notifications_active" : "notifications_none"} size={14} />
        {remind ? "Reminder on" : "Remind me"}
      </button>
    </span>
  );
}
