"use client";

import Link from "next/link";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { COUNTRIES } from "@/lib/catalog";
import { DEFAULT_DISCOVER_FILTERS, type DiscoverFilters } from "@/stores/discover";
import { openSheet } from "@/stores/ui";


/** One filter that's on, with what turning it off sets. */
export interface ActiveFilter {
  key: string;
  label: string;
  without: DiscoverFilters;
}

/** The filters that narrow the deck, each removable on its own. */
export function activeFilters(f: DiscoverFilters): ActiveFilter[] {
  const d = DEFAULT_DISCOVER_FILTERS;
  const out: ActiveFilter[] = [];
  if (f.countryCode)
    out.push({ key: "country", label: COUNTRIES.find((c) => c.code === f.countryCode)?.name ?? f.countryCode, without: { ...f, countryCode: null } });
  if (f.gender !== "anyone") out.push({ key: "gender", label: f.gender === "women" ? "Women" : "Men", without: { ...f, gender: "anyone" } });
  if (f.verifiedOnly) out.push({ key: "verified", label: "Verified only", without: { ...f, verifiedOnly: false } });
  if (f.minAge !== d.minAge || f.maxAge !== d.maxAge)
    out.push({ key: "age", label: `Ages ${f.minAge}–${f.maxAge}`, without: { ...f, minAge: d.minAge, maxAge: d.maxAge } });
  return out;
}

/**
 * Every state that replaces the deck (empty, offline, no photo…) sits in the
 * same frame, the size of a card: icon, headline, a line of text, then the
 * buttons. When the screen is short it scrolls instead of overlapping.
 */
const Frame = ({ children, label }: { children: React.ReactNode; label?: string }) => (
  <section aria-label={label} className="flex h-full flex-col overflow-y-auto overscroll-contain rounded-[28px] border border-line bg-surface px-[26px] py-6">
    <div className="m-auto flex w-full max-w-[340px] shrink-0 flex-col items-center text-center">{children}</div>
  </section>
);

const TONES = {
  pink: "bg-pink/14 text-pink",
  violet: "bg-lavender/14 text-lavender",
  muted: "bg-white/8 text-text2",
} as const;

/** The round icon at the top of every state. */
const StateIcon = ({ name, tone = "muted" }: { name: string; tone?: keyof typeof TONES }) => (
  <span aria-hidden className={`flex size-[72px] shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
    <Icon name={name} size={32} />
  </span>
);

const Body = ({ children }: { children: React.ReactNode }) => <p className="type-body mt-1.5 text-[14px] leading-[1.5] text-text2">{children}</p>;
const Actions = ({ children }: { children: React.ReactNode }) => <div className="mt-5 flex w-full flex-col gap-2.5">{children}</div>;

/**
 * While the deck loads: the shape of a card, not a spinner, so nothing jumps.
 * After a while it says so and offers a retry instead of looking stuck.
 */
export function DeckSkeleton({ label = "Finding people for you…", slow = false, onRetry }: { label?: string; slow?: boolean; onRetry?: () => void }) {
  const bar = (w: string, h: number, r = 8, mt = 0) => <span className="block bg-white/7" style={{ width: w, height: h, borderRadius: r, marginTop: mt }} />;
  return (
    <div aria-busy={!slow} aria-label={label} className="relative h-full overflow-hidden rounded-[28px]" style={{ background: "linear-gradient(160deg, var(--color-surface2), var(--color-surface))" }}>
      <div className="absolute inset-x-[18px] bottom-[22px] motion-safe:animate-pulse">
        {bar("60%", 30, 10)}
        {bar("45%", 14, 7, 12)}
        {bar("90%", 14, 7, 10)}
        <div className="mt-3 flex gap-1.5">
          {bar("70px", 28, 999)}
          {bar("80px", 28, 999)}
          {bar("64px", 28, 999)}
        </div>
      </div>
      <div role="status" className="absolute inset-x-6 top-[42%] flex flex-col items-center text-center">
        <p className="text-[13.5px] text-muted">{slow ? "Taking longer than usual…" : label}</p>
        {slow && onRetry ? <GhostButton label="Try again" icon="refresh" height={44} className="mt-3" onClick={onRetry} /> : null}
      </div>
    </div>
  );
}

/** The deck couldn't load: offline or the server didn't answer. */
export function DeckOffline({ onRetry, offline }: { onRetry: () => void; offline: boolean }) {
  return (
    <Frame label={offline ? "You're offline" : "Can't reach Vibe"}>
      <StateIcon name={offline ? "wifi_off" : "cloud_off"} />
      <Headline
        as="h2"
        text={offline ? "You're " : "Can't reach "}
        accent={offline ? "offline" : "Vibe"}
        accentColor="pink-soft"
        size={24}
        align="center"
        className="mt-[18px]"
      />
      <Body>
        {offline
          ? "Discover needs the internet to show people. We'll load them as soon as you're back."
          : "Something went wrong on our side. Give it a moment and try again."}
      </Body>
      <Actions>
        <GhostButton label="Try again" icon="refresh" expand onClick={onRetry} />
      </Actions>
      <p className="type-body mt-3 text-[12.5px] text-muted">Your likes and matches are safe.</p>
    </Frame>
  );
}

/** No photo: nobody can see you. Add one, or just look around. */
export function NoPhotoPanel({ onLookAround }: { hasName?: boolean; onLookAround: () => void }) {
  return (
    <Frame label="Add a photo to be seen">
      <StateIcon name="add_photo_alternate" tone="violet" />
      <Headline as="h2" text="Add a photo " accent="to be seen" accentColor="pink-soft" size={24} align="center" className="mt-[18px]" />
      <Body>Discover shows people with a photo. Add one of your face and others can find you here too. You can still look around.</Body>
      <Actions>
        <Link href="/me/edit" className="bg-brand flex h-[54px] shrink-0 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white hover:brightness-110">
          <Icon name="photo_camera" size={20} /> Add a photo
        </Link>
        <GhostButton label="Look around" height={48} expand onClick={onLookAround} />
      </Actions>
    </Frame>
  );
}

/** Nobody left in the deck: with filters on, which to drop; without, all caught up. */
export function DeckEmpty({
  filters,
  onSetFilters,
  onEditFilters,
  onMeetLive,
  notifyOn = null,
  onNotify,
}: {
  filters: DiscoverFilters;
  onSetFilters: (f: DiscoverFilters) => void;
  onEditFilters: () => void;
  onMeetLive: () => void;
  /** "Tell me when new people join": on, off, or not known yet (hidden). */
  notifyOn?: boolean | null;
  onNotify?: (on: boolean) => void;
}) {
  const active = activeFilters(filters);
  if (active.length) {
    return (
      <Frame label="No one fits these filters">
        <StateIcon name="tune" tone="violet" />
        <Headline as="h2" text="No one fits " accent="all of these" accentColor="lavender" size={24} align="center" className="mt-[18px]" />
        <Body>Your filters are hiding everyone right now. Tap one to remove it.</Body>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {active.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                aria-label={`Remove ${a.label}`}
                onClick={() => onSetFilters(a.without)}
                className="type-label inline-flex h-9 items-center gap-1.5 rounded-full bg-surface pr-2.5 pl-3.5 text-[13px] font-semibold text-text hover:bg-surface2"
              >
                {a.label}
                <Icon name="close" size={16} className="text-text2" />
              </button>
            </li>
          ))}
        </ul>
        <Actions>
          <GradientButton label="Show everyone" onClick={() => onSetFilters({ ...DEFAULT_DISCOVER_FILTERS })} />
          <GhostButton label="Edit filters" icon="tune" expand onClick={onEditFilters} />
        </Actions>
      </Frame>
    );
  }
  return (
    <Frame label="You're all caught up">
      <StateIcon name="check_circle" tone="pink" />
      <Headline as="h2" text="You're all caught up " accent="for now" accentColor="pink-soft" size={24} align="center" className="mt-[18px]" />
      <Body>You&apos;ve seen everyone who fits your filters. New people join all day.</Body>
      <Actions>
        <GradientButton label="Meet someone live" icon="videocam" height={54} onClick={onMeetLive} />
        <GhostButton label="Change filters" icon="tune" height={48} expand onClick={onEditFilters} />
      </Actions>
      {notifyOn == null || !onNotify ? null : notifyOn ? (
        <p role="status" className="type-body mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-text2">
          <Icon name="notifications_active" size={17} className="text-ok" />
          We&apos;ll tell you when new people join ·
          <button type="button" className="font-semibold text-text underline-offset-2 hover:underline" onClick={() => onNotify(false)}>
            Turn off
          </button>
        </p>
      ) : (
        <button type="button" className="mt-2.5 flex items-center justify-center gap-1.5 p-2 text-[13.5px] font-semibold text-lavender hover:underline" onClick={() => onNotify(true)}>
          <Icon name="notifications_none" size={17} />
          Tell me when new people join
        </button>
      )}
    </Frame>
  );
}

/** Discover is switched off for a while (admin): same frame as every other state. */
export function DeckResting({ onMeetLive }: { onMeetLive: () => void }) {
  return (
    <Frame label="Discover is resting">
      <StateIcon name="bedtime" tone="violet" />
      <Headline as="h2" text="Discover is " accent="resting" accentColor="lavender" size={24} align="center" className="mt-[18px]" />
      <Body>It&apos;s switched off for a little while. Your matches and chats are all still here.</Body>
      <Actions>
        <GradientButton label="Meet someone live" icon="videocam" onClick={onMeetLive} />
      </Actions>
    </Frame>
  );
}

export interface WelcomeBack {
  awayDays: number;
  likesSince: number;
  newPeople: number;
}

/** Back after a few days: what happened while you were away. Resolves "liked" to see who liked you. */
export const openWelcomeBack = (w: WelcomeBack & { freeLikes: number | null }) =>
  openSheet<"swipe" | "liked">((close) => <WelcomeBackSheet {...w} onPick={close} />);

function WelcomeBackSheet({
  awayDays,
  likesSince,
  newPeople,
  freeLikes,
  onPick,
}: WelcomeBack & { freeLikes: number | null; onPick: (v?: "swipe" | "liked") => void }) {
  const row = (icon: string, cls: string, text: string) => (
    <li className="flex items-center gap-3 rounded-[16px] bg-surface2 px-3.5 py-3">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${cls}`}>
        <Icon name={icon} size={19} variant="filled" />
      </span>
      <span className="type-body text-[14.5px] font-semibold">{text}</span>
    </li>
  );
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <Headline as="h2" text="Welcome " accent="back" accentColor="pink-soft" size={26} />
      <p className="type-body mt-1.5 text-[14px] text-text2">Here&apos;s what happened in the {awayDays} days you were away.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {likesSince > 0 ? row("favorite", "bg-pink/16 text-pink-soft", `${likesSince} ${likesSince === 1 ? "person" : "people"} liked you`) : null}
        {newPeople > 0 ? row("person_add", "bg-violet/18 text-lavender", `${newPeople} new ${newPeople === 1 ? "person" : "people"} to see`) : null}
        {freeLikes ? row("bolt", "bg-gold/14 text-gold", `Your ${freeLikes} free likes are ready`) : null}
      </ul>
      <GradientButton label="Start swiping" className="mt-5" onClick={() => onPick("swipe")} />
      {likesSince > 0 ? <GhostButton label="See who liked you" icon="favorite" expand className="mt-2" onClick={() => onPick("liked")} /> : null}
    </div>
  );
}

/** No likes left today: when they come back, and the ways to get more. Pass and Super Like still work. */
export function OutOfLikesBanner({ resetsAt, packSize, packCost, onMore }: { resetsAt: Date | null; packSize: number; packCost: number; onMore: () => void }) {
  const until = resetsAt ? resetsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div role="status" className="mx-4 mb-2.5 flex items-center gap-3 rounded-[18px] border border-pink/30 bg-pink/10 px-3.5 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-pink/16 text-pink-soft">
        <Icon name="schedule" size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold">{until ? `Out of likes until ${until}` : "Out of likes for today"}</span>
        <span className="block text-[12px] text-text2">
          {packSize} more for {packCost} coins, or unlimited with VIP
        </span>
      </span>
      <button type="button" onClick={onMore} className="bg-brand h-[34px] shrink-0 rounded-full px-3.5 text-[13px] font-bold text-white hover:brightness-110">
        Get more
      </button>
    </div>
  );
}
