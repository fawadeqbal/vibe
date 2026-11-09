"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Avatar } from "@/components/ui/avatar";
import { VideoScrims } from "@/components/ui/brand";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Glass, RoundControl } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Kbd, typingIn } from "@/components/ui/kbd";
import { OnlineDot } from "@/components/ui/misc";
import { CoinChip } from "@/components/ui/money";
import { useIsDesktop } from "@/hooks/use-media-query";
import { compact } from "@/lib/format";
import { useActivity } from "@/stores/activity";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { useWaitlist } from "@/stores/waitlist";
import { useWallet } from "@/stores/wallet";

import { FilterButton, FilterTags } from "@/features/filters/filter-chips";
import { FiltersPanel } from "@/features/filters/filters-panel";
import { VibeHourInvite } from "@/features/engagement/vibe-hour-invite";

import { VibeHourBanner } from "./lobby-extras";
import { openSafetySheet } from "./safety-sheet";
import { SelfVideo } from "./self-video";
import { type Availability, useAvailability } from "./use-availability";

/**
 * Home, ready to start: your camera fills the screen and everything sits on
 * top of it. Who's on and Vibe Hour at the top; your filters as chips, the
 * safe-start line and one big Start at your thumb. The same on every width
 * (a phone-shaped column on wide screens).
 */
export function Lobby({ onStart }: { onStart: () => void }) {
  return useIsDesktop() ? <DesktopLobby onStart={onStart} /> : <PhoneLobby onStart={onStart} />;
}

function PhoneLobby({ onStart }: { onStart: () => void }) {
  const someoneLooking = useWaitlist((s) => s.someoneLookingAt?.getTime());
  const availability = useAvailability({ refreshKey: someoneLooking });
  const camLive = useMatch((s) => !!s.localStream && s.camOn);
  const previewOn = useMatch((s) => s.previewOn);
  const cameraActive = useMatch((s) => s.cameraActive);
  const autoBlur = useMatch((s) => s.autoBlur);
  const lastError = useMatch((s) => s.lastError);

  return (
    <div className="absolute inset-0">
      <SelfVideo />
      <VideoScrims top={190} bottom={520} />
      <div className="absolute inset-0 mx-auto flex max-w-[560px] flex-col pt-[env(safe-area-inset-top)] pb-[calc(85px+env(safe-area-inset-bottom))] lg:pb-6">
        <LobbyTop availability={availability} />

        <div className="mt-3 flex flex-col items-center gap-2 px-4 empty:hidden">
          <VibeHourBanner />
          <VibeHourInvite compact />
        </div>

        {/* Filters on top of the camera buttons; the preview's own buttons only while it's on. */}
        <div className="relative mt-3 flex items-start justify-between px-4">
          {camLive ? (
            <Glass radius={15} className="flex h-[30px] items-center gap-1.5 bg-bg2/50 py-0">
              <Icon name="visibility" size={15} className="text-text2" />
              <span className="type-body text-[12px] text-text2">Only you see this preview</span>
            </Glass>
          ) : (
            <span />
          )}
          <div className="flex flex-col gap-2.5">
            <FilterButton glass size={42} />
            {camLive ? (
              <>
                <RoundControl icon="videocam_off" size={42} onClick={() => useMatch.getState().stopPreview()} ariaLabel="Turn camera preview off" />
                <RoundControl icon="cameraswitch" size={42} onClick={() => void useMatch.getState().switchCamera()} ariaLabel="Switch camera" />
              </>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-[88px] flex-1 items-center justify-center px-8 py-2">
          {camLive ? null : previewOn && cameraActive ? (
            <span role="status" aria-label="Starting camera" className="size-7 animate-spin rounded-full border-[2.5px] border-white/25 border-t-white/80" />
          ) : (
            <PreviewOff />
          )}
        </div>

        <div className="px-4">
          <FilterTags glass />
          {lastError ? (
            <p role="alert" className="type-body mt-3 rounded-[14px] bg-bad/12 px-3 py-2 text-[12.5px] text-bad">
              {lastError}
            </p>
          ) : null}
          <StartDock autoBlur={autoBlur} onStart={onStart} />
        </div>
      </div>
    </div>
  );
}

/**
 * The bottom of Home on a phone: one frosted dock. Safe start on the left
 * (tap for how it works), Start on the right. 14px under the filter tags,
 * 20px above the tab bar.
 */
function StartDock({ autoBlur, onStart }: { autoBlur: boolean; onStart: () => void }) {
  return (
    <div className="mt-3.5 flex h-16 items-center rounded-full border border-white/10 bg-bg2/52 p-1.5 backdrop-blur-[18px]">
      <button
        type="button"
        onClick={() => void openSafetySheet()}
        aria-label={autoBlur ? "Safe start: both videos stay blurred for 3 seconds. How it works" : "Safety: report and block are one tap away in every call. How it works"}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 pr-2 pl-3 text-left hover:bg-white/4"
      >
        <Icon name="shield" size={20} className="shrink-0 text-trust" />
        <span className="flex min-w-0 flex-col leading-[1.2]">
          <span className="truncate text-[13px] font-bold text-white">{autoBlur ? "Safe start" : "Safety on"}</span>
          <span className="truncate text-[11.5px] text-text2">{autoBlur ? "Blurred for 3 s" : "Report in one tap"}</span>
        </span>
      </button>
      <GradientButton
        label="Start chat"
        icon="videocam"
        height={52}
        expand={false}
        softGlow
        onClick={onStart}
        aria-label="Start a video chat with someone new"
        className="shrink-0 px-6"
      />
    </div>
  );
}

/**
 * Home on a desktop: your camera gets a big stage on the left, and the right
 * column holds what a phone opens as sheets: Vibe Hour, the filters inline,
 * the safe-start line and Start (Space starts too).
 */
function DesktopLobby({ onStart }: { onStart: () => void }) {
  const router = useRouter();
  const someoneLooking = useWaitlist((s) => s.someoneLookingAt?.getTime());
  const availability = useAvailability({ refreshKey: someoneLooking });
  const camLive = useMatch((s) => !!s.localStream && s.camOn);
  const previewOn = useMatch((s) => s.previewOn);
  const cameraActive = useMatch((s) => s.cameraActive);
  const autoBlur = useMatch((s) => s.autoBlur);
  const lastError = useMatch((s) => s.lastError);
  const coins = useWallet((s) => s.wallet.coins);
  const unread = useActivity((s) => s.unread);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typingIn(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <header className="flex h-[72px] shrink-0 items-center gap-3 px-7">
        <h1 className="type-display text-[26px]">
          Meet someone <span className="type-serif text-[30px] text-pink-soft">new</span>
        </h1>
        <WhoIsOn availability={availability} />
        <span className="flex-1" />
        <CoinChip coins={coins} onClick={() => router.push("/wallet")} />
        <RoundControl
          icon="notifications_none"
          size={40}
          badge={unread ? (unread > 99 ? "99+" : String(unread)) : undefined}
          onClick={() => router.push("/notifications")}
          ariaLabel={unread ? `Notifications, ${unread} new` : "Notifications"}
        />
      </header>

      <div className="flex min-h-0 flex-1 gap-6 px-7 pb-7">
        <section aria-label="Your camera" className="relative min-w-0 flex-1 overflow-hidden rounded-[28px] bg-surface shadow-[0_30px_60px_rgb(0_0_0/.35)]">
          <SelfVideo />
          {camLive ? <VideoScrims top={120} bottom={200} topAlpha={0.5} bottomAlpha={0.75} bottomMid={0.4} /> : null}
          {camLive ? (
            <Glass radius={16} className="absolute top-[18px] left-[18px] flex h-8 items-center gap-1.5 bg-bg2/50 py-0">
              <Icon name="visibility" size={15} className="text-text2" />
              <span className="type-body text-[12.5px] text-text2">Only you see this preview</span>
            </Glass>
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center p-8">
            {camLive ? null : previewOn && cameraActive ? (
              <span role="status" aria-label="Starting camera" className="size-7 animate-spin rounded-full border-[2.5px] border-white/25 border-t-white/80" />
            ) : (
              <PreviewOff />
            )}
          </div>
          {camLive ? (
            <div className="absolute inset-x-0 bottom-[22px] flex justify-center gap-3">
              <RoundControl icon="videocam_off" size={48} onClick={() => useMatch.getState().stopPreview()} ariaLabel="Turn camera preview off" />
              <RoundControl icon="cameraswitch" size={48} onClick={() => void useMatch.getState().switchCamera()} ariaLabel="Switch camera" />
            </div>
          ) : null}
        </section>

        <aside className="-mx-4 -mb-7 flex w-[412px] shrink-0 flex-col gap-3.5 overflow-y-auto px-4 pb-7">
          <div className="flex flex-col items-start gap-2 empty:hidden">
            <VibeHourBanner />
            <VibeHourInvite />
          </div>
          <FiltersPanel />
          <span className="min-h-4 flex-1" />
          <button type="button" onClick={() => void openSafetySheet()} className="flex items-center gap-2 text-left">
            <Icon name="shield" size={17} className="shrink-0 text-trust" />
            <span className="type-body text-[13px] text-text2 hover:text-text">
              {autoBlur ? "Safe start: both videos stay blurred for 3 seconds" : "Safety: report and block are one tap away in every call"}
            </span>
          </button>
          {lastError ? (
            <p role="alert" className="type-body rounded-[14px] bg-bad/12 px-3 py-2 text-[12.5px] text-bad">
              {lastError}
            </p>
          ) : null}
          <GradientButton
            label="Start video chat"
            icon="videocam"
            height={60}
            softGlow
            onClick={onStart}
            aria-label="Start a video chat with someone new"
            aria-keyshortcuts="Space"
            trailing={<Kbd className="border-white/30 bg-white/14 text-white">Space</Kbd>}
          />
        </aside>
      </div>
    </div>
  );
}

/** Your photo (to Me), who's on right now, your coins and the bell. */
function LobbyTop({ availability }: { availability: Availability | null }) {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const coins = useWallet((s) => s.wallet.coins);
  const unread = useActivity((s) => s.unread);
  return (
    <div className="flex items-center gap-2 px-4 pt-3">
      <button type="button" onClick={() => router.push("/me")} aria-label="Your profile" className="shrink-0">
        <Avatar url={me?.avatarUrl ?? ""} name={me?.name ?? "You"} size={40} ring />
      </button>
      <WhoIsOn availability={availability} />
      <span className="flex-1" />
      <CoinChip coins={coins} glass onClick={() => router.push("/wallet")} showPlus={false} />
      <RoundControl
        icon="notifications_none"
        size={40}
        badge={unread ? (unread > 99 ? "99+" : String(unread)) : undefined}
        onClick={() => router.push("/notifications")}
        ariaLabel={unread ? `Notifications, ${unread} new` : "Notifications"}
      />
    </div>
  );
}

/** Who's around, from the server, never a made-up number. */
function WhoIsOn({ availability }: { availability: Availability | null }) {
  if (!availability) return null;
  const quiet = availability.online === 0;
  return (
    <Glass radius={17} className="flex h-[34px] min-w-0 items-center gap-2 bg-bg2/50 py-0 pr-3 pl-2.5">
      <OnlineDot tone={quiet ? "warn" : undefined} />
      <span role="status" className="type-label truncate text-[13px] text-white">
        {quiet ? "Quiet right now" : `${compact(availability.online)} on now`}
      </span>
    </Glass>
  );
}

/** Camera off (it stays off to save battery until you need it). */
function PreviewOff() {
  return (
    <div className="flex max-w-[320px] flex-col items-center text-center">
      <span className="flex size-[84px] items-center justify-center rounded-full border border-white/12 bg-white/7">
        <Icon name="videocam_off" size={34} className="text-text2" />
      </span>
      <h2 className="type-display mt-[18px] text-[22px]">
        Camera preview is <span className="type-serif text-[26px] text-pink-soft">off</span>
      </h2>
      <p className="type-body mt-1.5 mb-[18px] text-[14px] leading-[1.5] text-text2">
        It stays off until you need it, to save battery. It turns on by itself when you start.
      </p>
      <GhostButton label="Turn on preview" icon="videocam" height={44} expand={false} onClick={() => useMatch.getState().startPreview()} />
    </div>
  );
}
