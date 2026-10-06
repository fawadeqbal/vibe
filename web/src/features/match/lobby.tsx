"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { VideoScrims } from "@/components/ui/brand";
import { Glass, GlassPill, RoundControl } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { OnlineDot, Tag } from "@/components/ui/misc";
import { CoinAmount, CoinChip } from "@/components/ui/money";
import type { Tone } from "@/lib/colors";
import { thousands, until } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { useCatalog } from "@/stores/catalog";
import { isVibeHour, useEngagement } from "@/stores/engagement";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { filterCost, isBoosted, isVip, useWallet } from "@/stores/wallet";

import { openFiltersSheet } from "./filters-sheet";
import { countryLabel, genderFilterIcon, genderFilterLabel, onlineEstimate } from "./labels";
import { FriendsOnline, VibeHourBanner } from "./lobby-extras";
import { openSafetySheet } from "./safety-sheet";
import { SelfVideo } from "./self-video";
import { confirmBoost } from "./use-match-actions";

/**
 * Idle: your own camera fills the screen clearly (scrims, not a dim), the
 * filters sit as pills, and the shutter-style Start lives in the thumb zone
 * between Boost and Safety.
 */
export function Lobby({ onStart }: { onStart: () => void }) {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const wallet = useWallet((s) => s.wallet);
  const boostCost = useCatalog((s) => s.economy.boostCost);
  const filters = useMatch((s) => s.filters);
  const camLive = useMatch((s) => !!s.localStream && s.camOn);
  const previewOn = useMatch((s) => s.previewOn);
  const cameraActive = useMatch((s) => s.cameraActive);
  const lastError = useMatch((s) => s.lastError);
  const setFilters = useMatch((s) => s.setFilters);
  const vibeHourWindow = useEngagement((s) => s.vibeHour);
  const now = useNow(5000, !!vibeHourWindow?.startsAt);
  const vibeHour = isVibeHour({ vibeHour: vibeHourWindow }, now);
  const vip = isVip(wallet);
  const boosted = isBoosted(wallet);
  const freeBoost = !boosted && wallet.freeBoosts > 0;
  const cost = filterCost(filters, vip || vibeHour);
  /** Paid filters read "Free" during Vibe Hour (VIP has them free anyway). */
  const freeTag = vibeHour && !vip ? <span className="type-label ml-1 rounded-[8px] bg-ok/16 px-1.5 py-0.5 text-[10.5px] text-ok">Free</span> : null;

  return (
    <div className="absolute inset-0">
      <SelfVideo />
      <VideoScrims top={200} bottom={500} />
      <div className="absolute inset-0 flex flex-col pt-[env(safe-area-inset-top)] pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Who you are + balance. */}
        <div className="flex items-center px-4 pt-3">
          {me ? <Avatar url={me.avatarUrl} name={me.name} size={40} border="rgb(255 255 255 / .25)" /> : null}
          <div className="ml-2.5 min-w-0 flex-1">
            <p className="type-title truncate text-[16px] font-semibold">{me ? `Hi ${me.name.split(" ")[0]}` : "Vibe"}</p>
            <p className="mt-px flex items-center text-white/72">
              <Icon name={camLive ? "lock" : "videocam_off"} size={13} />
              <span className="type-body ml-1 truncate text-[11.5px] leading-[1.2]">{camLive ? "Preview · only you can see this" : "Camera off · saving battery"}</span>
            </p>
          </div>
          {vip ? (
            <span className="mr-2">
              <Tag text="VIP" tone="gold" icon="workspace_premium" />
            </span>
          ) : null}
          {previewOn ? (
            <span className="mr-2">
              <RoundControl icon="videocam_off" size={40} onClick={() => useMatch.getState().stopPreview()} ariaLabel="Turn off preview" />
            </span>
          ) : null}
          <span className="mr-2">
            <RoundControl icon="emoji_events" size={40} onClick={() => router.push("/leaderboard")} ariaLabel="This week's top" />
          </span>
          <CoinChip coins={wallet.coins} glass onClick={() => router.push("/store")} />
        </div>

        <div className="mt-3 flex flex-col items-center gap-2 px-4 empty:hidden">
          <VibeHourBanner />
          <FriendsOnline />
        </div>

        <div className="flex flex-1 items-center justify-center">
          {camLive ? null : previewOn && cameraActive ? (
            <span role="status" aria-label="Starting camera" className="size-7 animate-spin rounded-full border-[2.5px] border-white/25 border-t-white/80" />
          ) : (
            <PreviewPrompt />
          )}
        </div>

        <div className="mx-auto w-full max-w-[560px]">
          <div className="flex items-center justify-center px-4">
            <OnlineDot />
            <span className="type-label ml-2 text-[13px] font-medium text-white/82">{thousands(onlineEstimate())} people online now</span>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-1.5 px-4">
            <GlassPill
              height={40}
              fontSize={13}
              icon={genderFilterIcon[filters.gender]}
              label={genderFilterLabel[filters.gender]}
              trailing={
                <>
                  {filters.gender !== "anyone" ? freeTag : null}
                  <Icon name="expand_more" size={16} className="text-text2" />
                </>
              }
              onClick={() => void openFiltersSheet()}
            />
            <GlassPill
              height={40}
              fontSize={13}
              icon="public"
              label={countryLabel(filters.countryCode)}
              trailing={
                <>
                  {filters.countryCode ? freeTag : null}
                  <Icon name="expand_more" size={16} className="text-text2" />
                </>
              }
              onClick={() => void openFiltersSheet()}
            />
            <GlassPill
              height={40}
              fontSize={13}
              icon="verified"
              iconVariant={filters.safeMode ? "round" : "outlined"}
              label="Verified only"
              tint={filters.safeMode ? "trust" : undefined}
              textColor={filters.safeMode ? "trust" : "white"}
              onClick={() => setFilters({ ...filters, safeMode: !filters.safeMode })}
            />
          </div>

          <div className="mt-5 flex items-end justify-between px-[38px]">
            <SideAction
              icon="bolt"
              iconColor="gold"
              tint={boosted ? "gold" : undefined}
              ariaLabel={boosted ? "Boosted" : freeBoost ? "Free boost" : `Boost for ${boostCost} coins`}
              onClick={() => void confirmBoost()}
              label={
                boosted ? (
                  <span className="type-label text-[11.5px] text-gold">{until(wallet.boostUntil!)}</span>
                ) : freeBoost ? (
                  <span className="type-label text-[11.5px] text-gold">Free boost</span>
                ) : (
                  <span className="type-label text-[11.5px] text-white/85">
                    Boost · <span className="text-gold">{boostCost}</span>
                  </span>
                )
              }
            />
            <Shutter onClick={onStart} cost={cost} />
            <SideAction icon="shield" iconColor="trust" ariaLabel="Safety settings" onClick={() => void openSafetySheet()} label={<span className="type-label text-[11.5px] text-white/85">Safety</span>} />
          </div>

          {lastError ? (
            <div className="mt-3 px-4">
              <Glass radius={16} className="flex items-center">
                <Icon name="error_outline" size={16} className="text-bad" />
                <span className="type-body ml-2 flex-1 text-[12px] text-white">{lastError}</span>
              </Glass>
            </div>
          ) : null}
          <div className="h-5" />
        </div>
      </div>
    </div>
  );
}

/** The lobby with the camera off: one tap opens the preview. Opening the page never turns the camera on. */
function PreviewPrompt() {
  return (
    <button type="button" onClick={() => useMatch.getState().startPreview()} aria-label="Turn on camera preview" className="group flex flex-col items-center px-6 text-center">
      <span className="flex size-[72px] items-center justify-center rounded-full border border-white/22 bg-white/8 transition-colors group-hover:bg-white/14">
        <Icon name="videocam" size={30} className="text-white" />
      </span>
      <span className="type-label mt-3 text-[14px] font-semibold text-white">Tap to preview your camera</span>
      <span className="type-body mt-1 text-[12px] text-white/62">It stays off until you need it — saves battery.</span>
    </button>
  );
}

/** The big round "shutter" Start button in the thumb zone. */
function Shutter({ onClick, cost }: { onClick: () => void; cost: number }) {
  return (
    <button type="button" onClick={onClick} aria-label={cost > 0 ? `Start matching, ${cost} coins` : "Start matching"} className="group flex flex-col items-center">
      <span className="flex size-[108px] items-center justify-center rounded-full border-[1.5px] border-white/22 p-[7px]">
        <span className="bg-brand flex size-full items-center justify-center rounded-full shadow-[0_14px_42.6px_rgb(255_61_143/.45)] transition-[filter] group-hover:brightness-110 group-active:brightness-95">
          <Icon name="videocam" size={40} className="text-white" />
        </span>
      </span>
      <span className="mt-2.5 flex items-center">
        <span className="type-title text-[15px]">Start</span>
        {cost > 0 ? (
          <>
            <span className="type-title text-[15px] whitespace-pre text-text2"> · </span>
            <CoinAmount amount={cost} size={13} />
          </>
        ) : null}
      </span>
    </button>
  );
}

function SideAction({ icon, iconColor, label, onClick, ariaLabel, tint }: { icon: string; iconColor: Tone; label: ReactNode; onClick: () => void; ariaLabel: string; tint?: Tone }) {
  return (
    <div className="flex w-[72px] flex-col items-center">
      <RoundControl icon={icon} iconColor={iconColor} size={56} tint={tint} onClick={onClick} ariaLabel={ariaLabel} />
      <span className="mt-2">{label}</span>
    </div>
  );
}
