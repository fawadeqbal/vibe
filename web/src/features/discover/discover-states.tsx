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
  if (f.countryCode) out.push({ key: "country", label: COUNTRIES.find((c) => c.code === f.countryCode)?.name ?? f.countryCode, without: { ...f, countryCode: "" } });
  if (f.gender !== "anyone") out.push({ key: "gender", label: f.gender === "women" ? "Women" : "Men", without: { ...f, gender: "anyone" } });
  if (f.verifiedOnly) out.push({ key: "verified", label: "Verified only", without: { ...f, verifiedOnly: false } });
  if (f.minAge !== d.minAge || f.maxAge !== d.maxAge) out.push({ key: "age", label: `Ages ${f.minAge}–${f.maxAge}`, without: { ...f, minAge: d.minAge, maxAge: d.maxAge } });
  return out;
}

const Frame = ({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) => (
  <div
    className={
      dashed
        ? "flex h-full flex-col items-center justify-center rounded-[28px] border border-dashed border-line px-6 py-6 text-center"
        : "flex h-full flex-col rounded-[28px] border border-white/8 bg-bg2 px-5 pt-6 pb-5"
    }
  >
    {children}
  </div>
);

/** While the deck loads: the shape of a card, not a spinner, so nothing jumps. */
export function DeckSkeleton() {
  return (
    <div aria-busy="true" aria-label="Finding people for you" className="relative h-full">
      <div className="absolute inset-x-3.5 -top-2 bottom-3 rounded-[28px] bg-bg2" />
      <div className="absolute inset-0 flex animate-pulse flex-col justify-end gap-2.5 rounded-[28px] bg-surface p-5 motion-reduce:animate-none">
        <span className="h-[22px] w-[150px] rounded-lg bg-surface3" />
        <span className="h-3.5 w-[110px] rounded-md bg-surface3" />
        <span className="mt-1 flex gap-1.5">
          <span className="h-6 w-[72px] rounded-full bg-surface3" />
          <span className="h-6 w-14 rounded-full bg-surface3" />
          <span className="h-6 w-16 rounded-full bg-surface3" />
        </span>
      </div>
      <p className="type-body absolute inset-x-0 top-[42%] text-center text-[14px] font-semibold text-text2">Finding people for you…</p>
    </div>
  );
}

/** The deck couldn't load: offline or the server didn't answer. */
export function DeckOffline({ onRetry, offline }: { onRetry: () => void; offline: boolean }) {
  return (
    <Frame dashed>
      <span className="flex size-[72px] items-center justify-center rounded-full bg-surface text-text2">
        <Icon name={offline ? "wifi_off" : "cloud_off"} size={32} />
      </span>
      <Headline as="h2" text={offline ? "You're " : "Can't reach "} accent={offline ? "offline" : "Vibe"} accentColor="pink-soft" size={24} align="center" className="mt-4" />
      <p className="type-body mt-2 max-w-[280px] text-[14px] leading-[1.5] text-text2">
        {offline ? "Discover needs the internet to show people. We'll load them as soon as you're back." : "Something went wrong on our side. Give it a moment and try again."}
      </p>
      <GhostButton label="Try again" icon="refresh" className="mt-5 w-full max-w-[260px]" expand onClick={onRetry} />
      <p className="type-body mt-3 text-[12.5px] text-text2">Your likes and matches are safe.</p>
    </Frame>
  );
}

/** No photo: nobody can see you. Add one, or just look around. */
export function NoPhotoPanel({ hasName, onLookAround }: { hasName: boolean; onLookAround: () => void }) {
  const step = (done: boolean, label: string, tag?: string, needed = false) => (
    <li className={`flex items-center gap-3 rounded-[16px] bg-surface px-3.5 py-3 ${needed ? "border border-pink/45" : ""}`}>
      {done ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-ok text-bg">
          <Icon name="check" size={15} />
        </span>
      ) : (
        <span className={`size-6 rounded-full border-2 ${needed ? "border-pink-soft" : "border-white/20"}`} />
      )}
      <span className={`type-body flex-1 text-[14px] ${done ? "text-text2" : "font-semibold"}`}>{label}</span>
      {tag ? <span className={`type-label text-[12px] font-semibold ${needed ? "text-pink-soft" : "text-text2"}`}>{tag}</span> : null}
    </li>
  );
  return (
    <Frame>
      <div className="flex flex-col items-center text-center">
        <Link
          href="/me/edit"
          aria-label="Add a photo"
          className="relative flex size-[104px] items-center justify-center rounded-full border-2 border-dashed border-pink-soft/60 bg-pink/8 text-pink-soft"
        >
          <Icon name="person" size={44} />
          <span className="absolute right-0.5 bottom-0.5 flex size-8 items-center justify-center rounded-full bg-pink text-white ring-[3px] ring-bg2">
            <Icon name="add" size={18} />
          </span>
        </Link>
        <Headline as="h2" text="Nobody can see you " accent="yet" accentColor="pink-soft" size={24} align="center" className="mt-4" />
        <p className="type-body mt-2 max-w-[300px] text-[14px] leading-[1.5] text-text2">Discover only shows people with a photo. Add one and others can see you — and like you back.</p>
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {step(false, "Add a clear photo of your face", "Needed", true)}
        {step(hasName, "Name and age")}
      </ol>
      <div className="flex-1" />
      <Link href="/me/edit" className="bg-brand type-title mt-4 flex h-[52px] items-center justify-center rounded-full text-[15px] font-bold text-white">
        Add a photo
      </Link>
      <TextButton className="mt-1 w-full text-text2" onClick={onLookAround}>
        Just look around for now
      </TextButton>
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
      <Frame>
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-violet/18 text-lavender">
          <Icon name="filter_alt" size={26} />
        </span>
        <Headline as="h2" text="No one fits " accent="all of these" accentColor="lavender" size={24} className="mt-4" />
        <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">Your filters are hiding everyone right now. Remove one to see more people.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {active.map((a) => (
            <li key={a.key} className="flex items-center gap-2.5 rounded-[16px] bg-surface py-1 pr-1 pl-3.5">
              <span className="type-body flex-1 text-[14px] font-semibold">{a.label}</span>
              <button
                type="button"
                aria-label={`Remove ${a.label}`}
                onClick={() => onSetFilters(a.without)}
                className="flex size-11 items-center justify-center rounded-full text-text2 hover:bg-white/8 hover:text-text"
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <div className="mt-4 flex flex-col gap-2">
          <GradientButton label="Show everyone" onClick={() => onSetFilters({ ...DEFAULT_DISCOVER_FILTERS })} />
          <GhostButton label="Edit filters" icon="tune" expand onClick={onEditFilters} />
        </div>
      </Frame>
    );
  }
  return (
    <Frame dashed>
      <div className="relative mb-4 h-24 w-[120px]" aria-hidden="true">
        <span className="absolute top-2 left-3.5 h-20 w-[62px] -rotate-[10deg] rounded-[14px] bg-surface2" />
        <span className="absolute top-1 left-11 h-20 w-[62px] rotate-[8deg] rounded-[14px] bg-surface3" />
        <span className="absolute top-1.5 left-[29px] flex h-[82px] w-[62px] items-center justify-center rounded-[14px] border-[1.5px] border-pink/50 bg-surface text-pink-soft">
          <Icon name="check" size={26} />
        </span>
      </div>
      <Headline as="h2" text="You're all caught up " accent="for now" accentColor="pink-soft" size={24} align="center" />
      <p className="type-body mt-2 max-w-[290px] text-[14px] leading-[1.5] text-text2">You&apos;ve seen everyone here. New people join all day — come back later, or meet someone live right now.</p>
      <div className="mt-5 flex w-full max-w-[300px] flex-col gap-2">
        <GradientButton label="Meet someone live" icon="videocam" onClick={onMeetLive} />
        <GhostButton label="Change filters" icon="tune" expand onClick={onEditFilters} />
      </div>
      {notifyOn == null || !onNotify ? null : notifyOn ? (
        <p role="status" className="type-body mt-4 flex items-center gap-1.5 text-[13px] text-text2">
          <Icon name="notifications_active" size={17} className="text-ok" />
          We&apos;ll tell you when new people join ·{" "}
          <button type="button" className="font-semibold text-text underline-offset-2 hover:underline" onClick={() => onNotify(false)}>
            Turn off
          </button>
        </p>
      ) : (
        <TextButton className="mt-3 text-lavender" onClick={() => onNotify(true)}>
          <Icon name="notifications" size={18} className="mr-1.5" />
          Tell me when new people join
        </TextButton>
      )}
    </Frame>
  );
}

export interface WelcomeBack {
  awayDays: number;
  likesSince: number;
  newPeople: number;
}

/** Back after a few days: what happened while you were away. Resolves "liked" to see who liked you. */
export const openWelcomeBack = (w: WelcomeBack & { freeLikes: number | null }) => openSheet<"swipe" | "liked">((close) => <WelcomeBackSheet {...w} onPick={close} />);

function WelcomeBackSheet({ awayDays, likesSince, newPeople, freeLikes, onPick }: WelcomeBack & { freeLikes: number | null; onPick: (v?: "swipe" | "liked") => void }) {
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
      <button type="button" onClick={onMore} className="type-label h-9 shrink-0 rounded-full bg-gold/14 px-3 text-[12.5px] font-bold text-gold hover:bg-gold/20">
        Get more
      </button>
    </div>
  );
}
