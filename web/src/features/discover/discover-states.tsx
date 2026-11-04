"use client";

import Link from "next/link";

import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { COUNTRIES } from "@/lib/catalog";
import { DEFAULT_DISCOVER_FILTERS, type DiscoverFilters } from "@/stores/discover";
import { openSheet } from "@/stores/ui";

import { comesBackIn } from "./discover-sheets";

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
  if (f.onlineOnly) out.push({ key: "online", label: "Online now", without: { ...f, onlineOnly: false } });
  if (f.countryCode)
    out.push({ key: "country", label: COUNTRIES.find((c) => c.code === f.countryCode)?.name ?? f.countryCode, without: { ...f, countryCode: "" } });
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
  <section aria-label={label} className="flex h-full flex-col overflow-y-auto overscroll-contain rounded-[28px] border border-line bg-bg2 px-5 py-6">
    <div className="m-auto flex w-full max-w-[320px] shrink-0 flex-col items-center text-center">{children}</div>
  </section>
);

const TONES = {
  pink: "bg-pink/14 text-pink-soft",
  violet: "bg-violet/18 text-lavender",
  muted: "bg-surface text-text2",
} as const;

/** The round icon at the top of every state. */
const StateIcon = ({ name, tone = "muted" }: { name: string; tone?: keyof typeof TONES }) => (
  <span aria-hidden className={`flex size-16 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
    <Icon name={name} size={30} />
  </span>
);

const Body = ({ children }: { children: React.ReactNode }) => <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">{children}</p>;
const Actions = ({ children }: { children: React.ReactNode }) => <div className="mt-5 flex w-full flex-col gap-2">{children}</div>;

/**
 * While the deck loads: the shape of a card, not a spinner, so nothing jumps.
 * After a while it says so and offers a retry instead of looking stuck.
 */
export function DeckSkeleton({ label = "Finding people for you…", slow = false, onRetry }: { label?: string; slow?: boolean; onRetry?: () => void }) {
  return (
    <div aria-busy={!slow} aria-label={label} className="relative h-full">
      <div className="absolute inset-x-3.5 -top-2 bottom-3 rounded-[28px] bg-bg2" />
      <div className="absolute inset-0 flex animate-pulse flex-col justify-end gap-2.5 rounded-[28px] border border-line bg-surface p-5 motion-reduce:animate-none">
        <span className="h-[22px] w-[150px] rounded-lg bg-surface3" />
        <span className="h-3.5 w-[110px] rounded-md bg-surface3" />
        <span className="mt-1 flex gap-1.5">
          <span className="h-6 w-[72px] rounded-full bg-surface3" />
          <span className="h-6 w-14 rounded-full bg-surface3" />
          <span className="h-6 w-16 rounded-full bg-surface3" />
        </span>
      </div>
      <div role="status" className="absolute inset-x-6 top-[38%] flex flex-col items-center text-center">
        <p className="type-body text-[14px] font-semibold text-text2">{slow ? "Taking longer than usual…" : label}</p>
        {slow && onRetry ? (
          <>
            <p className="type-body mt-1 text-[12.5px] text-muted">The connection looks slow.</p>
            <GhostButton label="Try again" icon="refresh" className="mt-3" onClick={onRetry} />
          </>
        ) : null}
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
        className="mt-4"
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
export function NoPhotoPanel({ hasName, onLookAround }: { hasName: boolean; onLookAround: () => void }) {
  const step = (done: boolean, label: string, tag?: string, needed = false) => (
    <li className={`flex items-center gap-3 rounded-[16px] bg-surface px-3.5 py-3 text-left ${needed ? "border border-pink/45" : ""}`}>
      {done ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ok text-bg">
          <Icon name="check" size={15} />
        </span>
      ) : (
        <span className={`size-6 shrink-0 rounded-full border-2 ${needed ? "border-pink-soft" : "border-white/20"}`} />
      )}
      <span className={`type-body flex-1 text-[14px] ${done ? "text-text2" : "font-semibold"}`}>{label}</span>
      {tag ? <span className={`type-label shrink-0 text-[12px] font-semibold ${needed ? "text-pink-soft" : "text-text2"}`}>{tag}</span> : null}
    </li>
  );
  return (
    <Frame label="Nobody can see you yet">
      <Link
        href="/me/edit"
        aria-label="Add a photo"
        className="relative flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-pink-soft/60 bg-pink/8 text-pink-soft"
      >
        <Icon name="person" size={30} />
        <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-pink text-white ring-[3px] ring-bg2">
          <Icon name="add" size={16} />
        </span>
      </Link>
      <Headline as="h2" text="Nobody can see you " accent="yet" accentColor="pink-soft" size={24} align="center" className="mt-4" />
      <Body>Discover only shows people with a photo. Add one and others can see you — and like you back.</Body>
      <ol className="mt-4 flex w-full flex-col gap-2">
        {step(false, "Add a clear photo of your face", "Needed", true)}
        {step(hasName, "Name and age")}
      </ol>
      <Actions>
        <Link
          href="/me/edit"
          className="bg-brand type-title flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white"
        >
          <Icon name="add_photo_alternate" size={20} /> Add a photo
        </Link>
        <TextButton className="w-full text-text2" onClick={onLookAround}>
          Just look around for now
        </TextButton>
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
        <Headline as="h2" text="No one fits " accent="all of these" accentColor="lavender" size={24} align="center" className="mt-4" />
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
      <Headline as="h2" text="You're all caught up " accent="for now" accentColor="pink-soft" size={24} align="center" className="mt-4" />
      <Body>You&apos;ve seen everyone here. New people join all day — come back later, or meet someone live right now.</Body>
      <Actions>
        <GradientButton label="Meet someone live" icon="videocam" onClick={onMeetLive} />
        <GhostButton label="Change filters" icon="tune" expand onClick={onEditFilters} />
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
        <TextButton className="mt-3 text-lavender" onClick={() => onNotify(true)}>
          <Icon name="notifications_none" size={18} className="mr-1.5" />
          Tell me when new people join
        </TextButton>
      )}
    </Frame>
  );
}

/** Discover is switched off for a while (admin): same frame as every other state. */
export function DeckResting({ onMeetLive }: { onMeetLive: () => void }) {
  return (
    <Frame label="Discover is resting">
      <StateIcon name="bedtime" tone="violet" />
      <Headline as="h2" text="Discover is " accent="resting" accentColor="lavender" size={24} align="center" className="mt-4" />
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
export function OutOfLikesBanner({ resetsAt, onMore }: { resetsAt: Date | null; onMore: () => void }) {
  return (
    <div role="status" className="mx-4 mb-2.5 flex items-center gap-3 rounded-[18px] border border-pink/30 bg-surface px-3.5 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pink/14 text-pink-soft">
        <Icon name="favorite" variant="filled" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[14px] font-semibold">That&apos;s today&apos;s likes used up</span>
        <span className="type-body block text-[12px] text-text2">
          Free likes back in {resetsAt ? comesBackIn(resetsAt) : "the morning"} · you can still pass and Super Like
        </span>
      </span>
      <button
        type="button"
        onClick={onMore}
        className="type-label h-9 shrink-0 rounded-full bg-gold/14 px-3 text-[12.5px] font-bold text-gold hover:bg-gold/20"
      >
        Get more
      </button>
    </div>
  );
}
