"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { VideoScrims } from "@/components/ui/brand";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Glass, GlassPill, RoundControl } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { OnlineDot, Tag } from "@/components/ui/misc";
import { CoinAmount, CoinChip } from "@/components/ui/money";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Headline, SectionTitle } from "@/components/ui/typography";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import type { Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { thousands, until } from "@/lib/format";
import { useCatalog } from "@/stores/catalog";
import { isVibeHour, useEngagement } from "@/stores/engagement";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { useWaitlist } from "@/stores/waitlist";
import { filterCost, isBoosted, isVip, useWallet } from "@/stores/wallet";

import { openFiltersSheet, TRUST_ROW } from "./filters-sheet";
import { countryHint, countryLabel, filterSummary, genderFilterHint, genderFilterIcon, genderFilterLabel, verifiedHint } from "./labels";
import { FriendsOnline, VibeHourBanner } from "./lobby-extras";
import { openSafetySheet } from "./safety-sheet";
import { SelfVideo } from "./self-video";
import { type Availability, useAvailability } from "./use-availability";
import { WaitlistStrip } from "./waitlist-strip";
import { confirmBoost } from "./use-match-actions";

/**
 * Idle. Phones keep the app's camera-first look: your own camera fills the
 * screen, filters sit as pills and the shutter-style Start lives in the
 * thumb zone. Wide screens split it: the camera on a stage, and a panel that
 * says what Start does, explains each filter and keeps Safety one quiet line
 * away.
 */
export function Lobby({ onStart }: { onStart: () => void }) {
  const wide = useIsDesktop();
  const someoneLooking = useWaitlist((s) => s.someoneLookingAt?.getTime());
  const availability = useAvailability({ refreshKey: someoneLooking });
  return wide ? <WideLobby onStart={onStart} availability={availability} /> : <PhoneLobby onStart={onStart} availability={availability} />;
}

/** Everything both layouts read: prices, Vibe Hour, boost state, camera state. */
function useLobbyState() {
  const wallet = useWallet((s) => s.wallet);
  const economy = useCatalog((s) => s.economy);
  const filters = useMatch((s) => s.filters);
  const autoBlur = useMatch((s) => s.autoBlur);
  const camLive = useMatch((s) => !!s.localStream && s.camOn);
  const previewOn = useMatch((s) => s.previewOn);
  const cameraActive = useMatch((s) => s.cameraActive);
  const lastError = useMatch((s) => s.lastError);
  const vibeHourWindow = useEngagement((s) => s.vibeHour);
  const now = useNow(5000, !!vibeHourWindow?.startsAt);
  const vibeHour = isVibeHour({ vibeHour: vibeHourWindow }, now);
  const vip = isVip(wallet);
  const boosted = isBoosted(wallet);
  return {
    wallet,
    economy,
    filters,
    autoBlur,
    camLive,
    previewOn,
    cameraActive,
    lastError,
    vibeHour,
    vip,
    boosted,
    freeBoost: !boosted && wallet.freeBoosts > 0,
    /** Paid filters are free for VIP and for everyone during Vibe Hour. */
    filtersFree: vip || vibeHour,
    cost: filterCost(filters, vip || vibeHour),
  };
}

/* ───────────────────────────── Phones ───────────────────────────── */

function PhoneLobby({ onStart, availability }: { onStart: () => void; availability: Availability | null }) {
  const s = useLobbyState();
  const setFilters = useMatch((st) => st.setFilters);
  const { filters } = s;
  /** Paid filters read "Free" during Vibe Hour (VIP has them free anyway). */
  const freeTag = s.vibeHour && !s.vip ? <span className="type-label ml-1 rounded-[8px] bg-ok/16 px-1.5 py-0.5 text-[10.5px] text-ok">Free</span> : null;

  return (
    <div className="absolute inset-0">
      <SelfVideo />
      <VideoScrims top={200} bottom={500} />
      <div className="absolute inset-0 flex flex-col pt-[env(safe-area-inset-top)] pb-[calc(64px+env(safe-area-inset-bottom))]">
        <LobbyHeader className="px-4 pt-3" />

        <div className="mt-3 flex flex-col items-center gap-2 px-4 empty:hidden">
          <VibeHourBanner />
          <FriendsOnline />
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <CameraState />
        </div>

        <div className="mx-auto w-full max-w-[560px]">
          <AvailabilityLine availability={availability} className="justify-center px-4" />
          <WaitlistStrip availability={availability} onStart={onStart} className="mt-2.5 px-4" />

          <div className="mt-4 flex flex-wrap justify-center gap-1.5 px-4">
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
          {/* The pills as a sentence, so "Anyone · Anywhere · Verified only" reads as a choice. */}
          <p className="type-body mt-2 px-4 text-center text-[12px] text-white/70" aria-live="polite">
            {filterSummary(filters)}
          </p>

          <div className="mt-4 flex items-end justify-between px-[38px]">
            <SideAction
              icon="bolt"
              iconColor="gold"
              tint={s.boosted ? "gold" : undefined}
              ariaLabel={s.boosted ? "Boosted" : s.freeBoost ? "Free boost" : `Boost for ${s.economy.boostCost} coins`}
              onClick={() => void confirmBoost()}
              label={
                s.boosted ? (
                  <span className="type-label text-[11.5px] text-gold">{until(s.wallet.boostUntil!)}</span>
                ) : s.freeBoost ? (
                  <span className="type-label text-[11.5px] text-gold">Free boost</span>
                ) : (
                  <span className="type-label text-[11.5px] text-white/85">
                    Boost · <span className="text-gold">{s.economy.boostCost}</span>
                  </span>
                )
              }
            />
            <Shutter onClick={onStart} cost={s.cost} />
            <SideAction
              icon="shield"
              iconColor="trust"
              ariaLabel="Safety settings"
              onClick={() => void openSafetySheet()}
              label={<span className="type-label text-[11.5px] text-white/70">Safety</span>}
            />
          </div>

          <LobbyError message={s.lastError} className="mt-3 px-4" />
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

/** The big round "shutter" Start button in the thumb zone, labelled with what it does. */
function Shutter({ onClick, cost }: { onClick: () => void; cost: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={cost > 0 ? `Start a video chat with someone new, ${cost} coins` : "Start a video chat with someone new"}
      className="group flex flex-col items-center"
    >
      <span className="flex size-[100px] items-center justify-center rounded-full border-[1.5px] border-white/22 p-[7px]">
        <span className="bg-brand flex size-full items-center justify-center rounded-full shadow-[0_14px_42.6px_rgb(255_61_143/.45)] transition-[filter] group-hover:brightness-110 group-active:brightness-95">
          <Icon name="videocam" size={38} className="text-white" />
        </span>
      </span>
      <span className="mt-2.5 flex items-center">
        <span className="type-title text-[15px]">Start video chat</span>
        {cost > 0 ? (
          <>
            <span className="type-title text-[15px] whitespace-pre text-text2"> · </span>
            <CoinAmount amount={cost} size={13} />
          </>
        ) : null}
      </span>
      <span className="type-body mt-0.5 text-[11.5px] text-white/62">1-on-1 with someone random</span>
    </button>
  );
}

function SideAction({
  icon,
  iconColor,
  label,
  onClick,
  ariaLabel,
  tint,
}: {
  icon: string;
  iconColor: Tone;
  label: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  tint?: Tone;
}) {
  return (
    <div className="flex w-[72px] flex-col items-center pb-[18px]">
      <RoundControl icon={icon} iconColor={iconColor} size={52} tint={tint} onClick={onClick} ariaLabel={ariaLabel} />
      <span className="mt-2">{label}</span>
    </div>
  );
}

/* ─────────────────────────── Wide screens ─────────────────────────── */

function WideLobby({ onStart, availability }: { onStart: () => void; availability: Availability | null }) {
  const s = useLobbyState();

  return (
    <div className="absolute inset-0 flex">
      {/* The stage: your camera, framed, instead of a screen-wide wash of purple. */}
      <section aria-label="Your camera" className="flex min-w-0 flex-1 p-5 xl:p-6">
        <div className="relative isolate flex flex-1 overflow-hidden rounded-[28px] border border-line">
          <SelfVideo />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/55 to-transparent" />
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <Glass radius={14} className="flex h-8 items-center py-0">
              <Icon name={s.camLive ? "lock" : "videocam_off"} size={14} className="text-white/80" />
              <span className="type-label ml-1.5 text-[12px] text-white/85">{s.camLive ? "Preview · only you can see this" : "Camera off"}</span>
            </Glass>
          </div>
          {s.previewOn ? (
            <div className="absolute top-3 right-3">
              <RoundControl icon="videocam_off" size={40} onClick={() => useMatch.getState().stopPreview()} ariaLabel="Turn off preview" />
            </div>
          ) : null}
          <div className="relative flex flex-1 items-center justify-center p-8">
            <CameraState wide />
          </div>
        </div>
      </section>

      {/* The panel: what Start does, who you'll meet, then Start. */}
      <aside aria-label="Start matching" className="flex w-[400px] shrink-0 flex-col overflow-y-auto py-5 pr-5 xl:w-[440px] xl:py-6 xl:pr-6">
        <LobbyHeader showPreviewToggle={false} />

        <div className="mt-4 flex flex-col items-start gap-2 empty:hidden">
          <VibeHourBanner />
          <FriendsOnline />
        </div>

        <Headline as="h1" text="Meet someone " accent="new." size={32} className="mt-7" />
        <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">
          Start pairs you with one random person for a face-to-face video chat. Not feeling it? Skip to the next one.
        </p>
        <AvailabilityLine availability={availability} className="mt-4" />
        <WaitlistStrip availability={availability} onStart={onStart} className="mt-3 justify-start" />

        <SectionTitle text="Who you'll meet" top={26} bottom={10} note={s.filtersFree ? (s.vip ? "Free with VIP" : "Free during Vibe Hour") : undefined} />
        <FilterRows free={s.filtersFree} />

        <GradientButton
          className="mt-6 shrink-0"
          label="Start video chat"
          icon="videocam"
          height={60}
          onClick={onStart}
          aria-label={s.cost > 0 ? `Start a video chat with someone new, ${s.cost} coins` : "Start a video chat with someone new"}
          trailing={
            s.cost > 0 ? (
              <span className="rounded-full bg-black/22 px-2.5 py-1">
                <CoinAmount amount={s.cost} size={13} />
              </span>
            ) : null
          }
        />
        <p className="type-body mt-2.5 text-center text-[12.5px] text-text2" aria-live="polite">
          {filterSummary(s.filters)}
          {s.cost > 0 ? " Filters are charged per match." : ""}
        </p>
        <LobbyError message={s.lastError} className="mt-3" />

        <div className="min-h-6 flex-1" />

        <div className="flex items-center gap-2">
          <GhostButton
            height={44}
            icon="bolt"
            label={s.boosted ? `Boosted · ${until(s.wallet.boostUntil!)}` : s.freeBoost ? "Use your free boost" : "Boost · skip the queue"}
            labelClassName="text-text"
            className="flex-1 [&>svg:first-child]:text-gold"
            trailing={s.boosted || s.freeBoost ? null : <CoinAmount amount={s.economy.boostCost} size={12} />}
            onClick={s.boosted ? undefined : () => void confirmBoost()}
            title="Go to the front of the queue"
          />
        </div>
        <SafetyLine autoBlur={s.autoBlur} safeMode={s.filters.safeMode} />
      </aside>
    </div>
  );
}

/** Each filter as a row that says what it means and what it costs. */
function FilterRows({ free }: { free: boolean }) {
  const filters = useMatch((s) => s.filters);
  const e = useCatalog((s) => s.economy);
  const price = (on: boolean, coins: number) =>
    !on || free ? (
      <span className="type-label text-[12px] text-ok">Free</span>
    ) : (
      <span className="flex items-center">
        <CoinAmount amount={coins} size={12} />
        <span className="type-body ml-1 text-[11.5px] text-muted">/match</span>
      </span>
    );
  const chevron = <Icon name="chevron_right" size={20} className="ml-1.5 text-muted" />;
  return (
    <GroupCard>
      <GroupRow
        icon={genderFilterIcon[filters.gender]}
        iconColor="pink-soft"
        title={
          <span>
            Gender <span className="text-text2">· {genderFilterLabel[filters.gender]}</span>
          </span>
        }
        subtitle={genderFilterHint[filters.gender]}
        trailing={
          <>
            {price(filters.gender !== "anyone", e.genderFilterCost)}
            {chevron}
          </>
        }
        onClick={() => void openFiltersSheet()}
      />
      <GroupRow
        icon="public"
        iconColor="lavender"
        title={
          <span>
            Region <span className="text-text2">· {countryLabel(filters.countryCode)}</span>
          </span>
        }
        subtitle={countryHint(filters.countryCode)}
        trailing={
          <>
            {price(filters.countryCode != null, e.regionFilterCost)}
            {chevron}
          </>
        }
        onClick={() => void openFiltersSheet()}
      />
      <GroupRow
        icon="verified"
        iconVariant={filters.safeMode ? "round" : "outlined"}
        {...TRUST_ROW}
        title="Verified only"
        subtitle={`${verifiedHint(filters.safeMode)} · Free`}
        trailing={<Switch checked={filters.safeMode} onChange={(v) => useMatch.getState().setFilters({ ...filters, safeMode: v })} label="Verified only" />}
      />
    </GroupCard>
  );
}

/** Safety, one quiet line: what's on, and the way in. It never competes with Start. */
function SafetyLine({ autoBlur, safeMode }: { autoBlur: boolean; safeMode: boolean }) {
  const on = [autoBlur ? "soft start on" : null, safeMode ? "verified only" : null, "report in one tap"].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => void openSafetySheet()}
      className="group mt-3 flex items-center rounded-[14px] px-1 py-2 text-left transition-colors hover:bg-white/4"
    >
      <Icon name="shield" size={18} className="text-trust" />
      <span className="type-body ml-2 flex-1 text-[12.5px] text-text2">
        <span className="type-label text-text">Safety</span> · {on}
      </span>
      <span className="type-label text-[12.5px] text-trust group-hover:underline">Settings</span>
      <Icon name="chevron_right" size={18} className="text-trust" />
    </button>
  );
}

/* ───────────────────────────── Shared ───────────────────────────── */

/** Who you are, plus the shortcuts that matter here: leaderboard and coins. */
function LobbyHeader({ className, showPreviewToggle = true }: { className?: string; showPreviewToggle?: boolean }) {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const wallet = useWallet((s) => s.wallet);
  const camLive = useMatch((s) => !!s.localStream && s.camOn);
  const previewOn = useMatch((s) => s.previewOn);
  const vip = isVip(wallet);
  return (
    <div className={cn("flex items-center", className)}>
      {me ? <Avatar url={me.avatarUrl} name={me.name} size={40} border="rgb(255 255 255 / .25)" /> : null}
      <div className="ml-2.5 min-w-0 flex-1">
        <p className="type-title truncate text-[16px] font-semibold">{me ? `Hi ${me.name.split(" ")[0]}` : "Vibe"}</p>
        {showPreviewToggle ? (
          <p className="mt-px flex items-center text-white/72">
            <Icon name={camLive ? "lock" : "videocam_off"} size={13} />
            <span className="type-body ml-1 truncate text-[11.5px] leading-[1.2]">
              {camLive ? "Preview · only you can see this" : "Camera off · saving battery"}
            </span>
          </p>
        ) : (
          <p className="type-body mt-px truncate text-[12px] text-text2">Ready when you are</p>
        )}
      </div>
      {vip ? (
        <span className="mr-2">
          <Tag text="VIP" tone="gold" icon="workspace_premium" />
        </span>
      ) : null}
      {showPreviewToggle && previewOn ? (
        <span className="mr-2">
          <RoundControl icon="videocam_off" size={40} onClick={() => useMatch.getState().stopPreview()} ariaLabel="Turn off preview" />
        </span>
      ) : null}
      <span className="mr-2">
        <RoundControl icon="emoji_events" size={40} onClick={() => router.push("/leaderboard")} ariaLabel="This week's top" />
      </span>
      <CoinChip coins={wallet.coins} glass onClick={() => router.push("/store")} />
    </div>
  );
}

/**
 * Who's around, from the server — never a made-up number. Quiet hours say so
 * up front, so an empty queue isn't a surprise after pressing Start.
 */
function AvailabilityLine({ availability, className }: { availability: Availability | null; className?: string }) {
  if (!availability) return <div className={cn("h-5", className)} aria-hidden />;
  const { online, searching } = availability;
  if (online === 0)
    return (
      <p className={cn("flex items-center", className)} role="status">
        <OnlineDot tone="warn" />
        <span className="type-label ml-2 text-[13px] font-medium text-white/82">Quiet right now — you&apos;ll be first in line</span>
      </p>
    );
  return (
    <p className={cn("flex items-center", className)} role="status">
      <OnlineDot />
      <span className="type-label ml-2 text-[13px] font-medium text-white/82">
        {thousands(online)} online
        {searching > 0 ? <span className="text-white/60"> · {thousands(searching)} looking for a match</span> : null}
      </span>
    </p>
  );
}

/**
 * The middle of the stage. Camera off: one tap opens the preview, plus what
 * happens after Start. Starting: a spinner. Live: nothing — your face is the point.
 */
function CameraState({ wide = false }: { wide?: boolean }) {
  const camLive = useMatch((s) => !!s.localStream && s.camOn);
  const previewOn = useMatch((s) => s.previewOn);
  const cameraActive = useMatch((s) => s.cameraActive);
  const autoBlur = useMatch((s) => s.autoBlur);
  if (camLive) return null;
  if (previewOn && cameraActive)
    return <span role="status" aria-label="Starting camera" className="size-7 animate-spin rounded-full border-[2.5px] border-white/25 border-t-white/80" />;
  return (
    <div className="flex w-full max-w-[460px] flex-col items-center">
      <button
        type="button"
        onClick={() => useMatch.getState().startPreview()}
        aria-label="Turn on camera preview"
        className="group flex flex-col items-center text-center"
      >
        <span className="flex size-[64px] items-center justify-center rounded-full border border-white/22 bg-white/8 transition-colors group-hover:bg-white/14">
          <Icon name="videocam" size={28} className="text-white" />
        </span>
        <span className="type-label mt-3 text-[14px] font-semibold text-white">{wide ? "Check your camera" : "Tap to preview your camera"}</span>
        <span className="type-body mt-1 text-[12px] text-white/62">Only you see this. It stays off until you need it.</span>
      </button>
      <HowItWorks autoBlur={autoBlur} className={cn("mt-6 w-full", !wide && "[@media(max-height:760px)]:hidden")} />
    </div>
  );
}

/** What pressing Start actually does, in three beats. */
function HowItWorks({ autoBlur, className }: { autoBlur: boolean; className?: string }) {
  const steps = [
    { icon: "shuffle", title: "One random person", body: "Face to face, one-on-one." },
    autoBlur
      ? { icon: "blur_on", title: "A soft start", body: "Both videos are blurred for 3 seconds." }
      : { icon: "videocam", title: "Straight to video", body: "Video starts as soon as you connect." },
    { icon: "skip_next", title: "Skip anytime", body: "Next is one tap. So is Report." },
  ];
  return (
    <Glass radius={20} className={cn("border-white/10 bg-bg2/55 px-4 py-3.5", className)}>
      <p className="type-overline mb-2.5 text-white/60">When you press Start</p>
      <ol className="flex flex-col gap-2.5">
        {steps.map((st, i) => (
          <li key={st.title} className="flex items-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/8">
              <Icon name={st.icon} size={18} className="text-pink-soft" />
            </span>
            <span className="ml-3 min-w-0">
              <span className="type-label block text-[13px] text-white">
                <span className="sr-only">{i + 1}. </span>
                {st.title}
              </span>
              <span className="type-body block text-[12px] text-white/62">{st.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </Glass>
  );
}

function LobbyError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div className={className} role="alert">
      <Glass radius={16} className="flex items-center">
        <Icon name="error_outline" size={16} className="text-bad" />
        <span className="type-body ml-2 flex-1 text-[12px] text-white">{message}</span>
      </Glass>
    </div>
  );
}
