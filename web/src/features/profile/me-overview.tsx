"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { myInviteLink, shareLink } from "@/components/shared/share-card";
import { startSelfieVerification } from "@/components/shared/selfie-verification";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton } from "@/components/ui/button";
import { Glass, GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { alpha, color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { thousands } from "@/lib/format";
import { genderLabel, intentInfo, isProfileComplete, type Profile } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendsOf, useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

import { changeProfilePhoto } from "./change-photo";
import { profileSteps } from "./profile-steps";

/* ───────────────────────── Profile header ───────────────────────── */

/**
 * The top of Me, laid out like the profile pages people already know:
 * photo with the brand ring, your three numbers beside it, then name, a
 * line about where you're from and your bio, and Edit / Share / Preview.
 */
export function ProfileHeader({ me }: { me: Profile }) {
  const router = useRouter();
  const friends = useSocial((s) => friendsOf(s).length);
  const level = useEngagement((s) => s.level);
  const vip = useWallet((s) => isVip(s.wallet));
  const [uploading, setUploading] = useState(false);
  const hasPhoto = me.avatarUrl.length > 0;

  const share = async () => {
    const link = myInviteLink();
    await shareLink({ text: `I'm on Vibe, free video chat with real people. Come say hi${me.name ? ` to ${me.name}` : ""}:`, url: link ?? undefined });
  };

  const meta = [`${me.country.flag} ${me.country.name}`, genderLabel[me.gender], ...(level ? [`Level ${level.level}`] : [])].join(" · ");

  return (
    <section aria-label="Your profile">
      <div className="flex items-center gap-[18px]">
        <button
          type="button"
          onClick={hasPhoto ? () => void previewProfile(me, vip) : uploading ? undefined : () => void changeProfilePhoto(setUploading)}
          aria-label={hasPhoto ? "See how others see you" : "Add a profile photo"}
          className="bg-brand relative size-[92px] shrink-0 rounded-full p-[3px]"
        >
          <span className="flex size-full items-center justify-center overflow-hidden rounded-full border-[3px] border-bg bg-surface2">
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="size-full object-cover" />
            ) : uploading ? (
              <Spinner size={24} stroke={3} />
            ) : (
              <Icon name="add_a_photo" size={30} className="text-text2" />
            )}
          </span>
          {me.verified ? (
            <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border-[3px] border-bg bg-trust">
              <Icon name="check" size={16} className="text-on-gem" label="Verified" />
            </span>
          ) : null}
        </button>
        <div className="flex flex-1">
          <Stat value={me.matches} label="Matches" href="/me/matches" />
          <Stat value={me.likes} label="Likes" />
          <Stat value={friends} label="Friends" href="/chats" />
        </div>
      </div>

      <div className="mt-3.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="type-title text-[17px]">
            {me.name}, {me.age}
          </span>
          {vip ? <Chip label="VIP" tone="gold" icon="workspace_premium" /> : null}
          {me.verified ? <Chip label="Verified" tone="trust" icon="verified" /> : <Chip label="Not verified" />}
        </p>
        <p className="type-body mt-1 text-[13px] text-text2">{meta}</p>
        {me.bio.trim() ? <p className="type-body mt-1 line-clamp-3 text-[14px] text-text">{me.bio}</p> : null}
      </div>

      <div className="mt-3.5 grid grid-cols-[1fr_1fr_40px] gap-2">
        <GhostButton label="Edit profile" height={40} expand onClick={() => router.push("/me/edit")} />
        <GhostButton label="Share profile" height={40} expand onClick={() => void share()} />
        <button
          type="button"
          onClick={() => void previewProfile(me, vip)}
          aria-label="See how others see you"
          className="flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-text transition-colors hover:bg-white/9"
        >
          <Icon name="visibility" size={19} />
        </button>
      </div>
    </section>
  );
}

function Stat({ value, label, href }: { value: number; label: string; href?: string }) {
  const body = (
    <>
      <span className="type-number-lg text-[20px]">{thousands(value)}</span>
      <span className="type-label mt-0.5 text-[12px] text-text2">{label}</span>
    </>
  );
  const cls = "flex flex-1 flex-col items-center rounded-[14px] py-1.5";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-white/4")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

function Chip({ label, tone, icon }: { label: string; tone?: Tone; icon?: string }) {
  return (
    <span
      className="type-label inline-flex h-[22px] items-center rounded-full px-2 text-[11px]"
      style={{ backgroundColor: tone ? alpha(tone, 0.14) : "rgb(255 255 255 / .06)", color: tone ? color(tone) : color("text2") }}
    >
      {icon ? <Icon name={icon} size={13} className="mr-1" /> : null}
      {label}
    </span>
  );
}

/** "How others see you": the full profile card in a sheet. */
export const previewProfile = (me: Profile, vip: boolean) =>
  openSheet<void>(() => (
    <div className="px-4 pt-2 pb-4">
      <ProfileCard me={me} vip={vip} />
    </div>
  ));

/* ───────────────────────── Complete your profile ───────────────────────── */

interface Todo {
  id: string;
  icon: string;
  tone: Tone;
  title: string;
  body: string;
  action: string;
  busy?: boolean;
  onClick?: () => void;
}

/**
 * What's left, as small cards you swipe through (photo, bio, interests,
 * here for, verification, then the coin bonus). Gone once everything's done.
 */
export function CompleteProfile({ me }: { me: Profile }) {
  const router = useRouter();
  const v = useSession((s) => s.verificationState);
  const busy = useSession((s) => s.busy);
  const bonusClaimed = useWallet((s) => s.wallet.profileBonusClaimed);
  const bonus = useCatalog((s) => s.economy.profileCompleteCoins);
  const [claiming, setClaiming] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void useSession.getState().loadVerification();
  }, []);

  const steps = profileSteps(me);
  const todos: Todo[] = [];
  const bonusLine = !bonusClaimed ? ` · part of +${bonus} coins` : "";
  for (const s of steps) {
    if (s.done) continue;
    if (s.id === "photo") todos.push({ id: s.id, icon: "add_a_photo", tone: "pink", title: "Add a photo", body: "A clear face photo gets more matches", action: "Add", busy: uploading, onClick: () => void changeProfilePhoto(setUploading) });
    if (s.id === "bio") todos.push({ id: s.id, icon: "edit_note", tone: "lavender", title: "Write a bio", body: `One line about you${bonusLine}`, action: "Write", onClick: () => router.push(s.href) });
    if (s.id === "interests") todos.push({ id: s.id, icon: "interests", tone: "pink", title: "Add interests", body: `${s.action}${bonusLine}`, action: "Add", onClick: () => router.push(s.href) });
    if (s.id === "intent") todos.push({ id: s.id, icon: "waving_hand", tone: "lavender", title: "Why you're here", body: "Friends, dating or just chat", action: "Add", onClick: () => router.push(s.href) });
  }
  const verifyDone = me.verified || v.status === "pending";
  if (!me.verified) {
    const hasPhoto = me.avatarUrl.length > 0;
    todos.push(
      v.status === "pending"
        ? { id: "verify", icon: "hourglass_top", tone: "trust", title: "Selfie in review", body: "A person is checking it now", action: "" }
        : { id: "verify", icon: "verified_user", tone: "trust", title: v.status === "rejected" ? "Try verifying again" : "Get verified", body: hasPhoto ? "Quick selfie, get the badge" : "Add a photo first", action: "Verify", busy, onClick: hasPhoto ? () => void startSelfieVerification() : undefined },
    );
  }
  const bonusReady = !bonusClaimed && isProfileComplete(me);
  if (bonusReady)
    todos.unshift({
      id: "bonus",
      icon: "paid",
      tone: "gold",
      title: `+${bonus} coins`,
      body: "Your profile bonus is ready",
      action: "Claim",
      busy: claiming,
      onClick: async () => {
        setClaiming(true);
        try {
          const r = await useWallet.getState().claimProfileBonus();
          toast(r == null ? "Already claimed" : `+${r} coins`, { error: r == null });
        } finally {
          setClaiming(false);
        }
      },
    });
  if (!todos.length) return null;

  const total = steps.length + 1;
  const done = steps.filter((s) => s.done).length + (verifyDone ? 1 : 0);
  return (
    <section aria-label="Complete your profile">
      <SectionTitle text={`Complete your profile · ${done} of ${total}`} top={26} bottom={10} />
      <div className="-mx-5 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {todos.map((t) => (
          <TodoCard key={t.id} t={t} />
        ))}
      </div>
    </section>
  );
}

function TodoCard({ t }: { t: Todo }) {
  return (
    <div className="flex w-[152px] shrink-0 snap-start flex-col items-center rounded-card border border-line bg-surface px-3 pt-4 pb-3 text-center">
      <span className="flex size-[52px] items-center justify-center rounded-full" style={{ backgroundColor: alpha(t.tone, 0.14) }}>
        <Icon name={t.icon} size={24} style={{ color: color(t.tone) }} />
      </span>
      <span className="type-title mt-2.5 text-[14px]">{t.title}</span>
      <span className="type-body mt-0.5 min-h-[32px] text-[12px] leading-[1.35] text-text2">{t.body}</span>
      {t.action ? (
        <button
          type="button"
          onClick={t.busy ? undefined : t.onClick}
          disabled={!t.onClick}
          className={cn(
            "type-label mt-2.5 flex h-[34px] w-full items-center justify-center rounded-full text-[13px] text-white transition-[filter] hover:brightness-110 disabled:opacity-45",
            t.tone === "gold" ? "bg-gold-grad text-on-gold" : "bg-brand",
          )}
        >
          {t.busy ? <Spinner size={16} stroke={2.2} /> : t.action}
        </button>
      ) : (
        <span className="type-label mt-2.5 flex h-[34px] items-center text-[12.5px] text-warn">In review</span>
      )}
    </div>
  );
}

/* ───────────────────────── Recent matches ───────────────────────── */

/** The people from your last calls, like a row of stories; tap one for their profile. */
export function RecentMatches() {
  const router = useRouter();
  const history = useMatch((s) => s.history);
  const seen = new Set<string>();
  const people = [...history]
    .reverse()
    .filter((r) => (seen.has(r.partner.id) ? false : (seen.add(r.partner.id), true)))
    .slice(0, 8);
  if (!people.length) return null;
  return (
    <section aria-label="Recent matches">
      <SectionTitle text="Recent matches" action="See all" onAction={() => router.push("/me/matches")} top={26} bottom={10} />
      <div className="-mx-5 flex gap-3.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {people.map((r) => (
          <Link key={r.partner.id} href={`/u/${r.partner.id}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5 transition-opacity hover:opacity-85">
            <Avatar url={r.partner.avatarUrl} name={r.partner.name} size={58} />
            <span className="type-label w-full truncate text-center text-[12px] text-text2">{r.partner.name.split(" ")[0]}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── Profile card ───────────────────────── */

/**
 * "How others see you". With a photo, the photo is the card. Without one,
 * the card asks for a real photo instead of showing a big initial; missing
 * bio and "here for" show as gaps to fill, not as nothing.
 */
export function ProfileCard({ me, vip }: { me: Profile; vip: boolean }) {
  const [uploading, setUploading] = useState(false);
  const hasPhoto = me.avatarUrl.length > 0;
  const addPhoto = () => void changeProfilePhoto(setUploading);

  return (
    <div
      className={cn("relative isolate flex flex-col overflow-hidden rounded-[28px] border border-line", hasPhoto ? "h-[360px]" : "min-h-[400px]")}
      style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #1A1724)" }}
    >
      {hasPhoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={me.avatarUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          <div
            className="absolute inset-x-0 bottom-0 -z-10 h-[240px]"
            style={{ backgroundImage: "linear-gradient(to top, rgb(11 10 16 / .94), rgb(11 10 16 / 0))" }}
          />
        </>
      ) : null}

      <div className="flex items-start justify-between gap-2 p-3">
        <GlassPill label="How others see you" icon="visibility" height={28} fontSize={11.5} />
        <div className="flex flex-col items-end gap-1.5">
          {vip ? <GlassPill label="VIP" icon="workspace_premium" tint="gold" textColor="gold" height={28} fontSize={11.5} /> : null}
          {me.verified ? <GlassPill label="Verified" icon="verified" tint="trust" textColor="trust" height={28} fontSize={11.5} /> : null}
        </div>
      </div>

      {hasPhoto ? (
        <div className="flex-1" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-4 text-center">
          <button
            type="button"
            onClick={uploading ? undefined : addPhoto}
            aria-label="Add a profile photo"
            className="group relative flex size-[104px] items-center justify-center rounded-full border-2 border-dashed border-white/30 bg-white/6 transition-colors hover:border-pink-soft hover:bg-white/10"
          >
            {uploading ? <Spinner size={28} stroke={3} /> : <Icon name="add_a_photo" size={36} className="text-white/85 group-hover:text-pink-soft" />}
          </button>
          <p className="type-title mt-3.5 text-[17px] font-semibold">Add a photo of you</p>
          <p className="type-body mt-1 max-w-[300px] text-[13px] leading-[1.45] text-white/70">
            A clear face photo gets you more matches. You also need one to get verified.
          </p>
          <button
            type="button"
            onClick={uploading ? undefined : addPhoto}
            className="type-label mt-3.5 flex h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold text-bg transition-[filter] hover:brightness-90"
          >
            <Icon name="photo_camera" size={18} className="mr-1.5" />
            {uploading ? "Uploading…" : "Add photo"}
          </button>
        </div>
      )}

      <div className="px-[18px] pb-4">
        <p className="flex items-center">
          <span className="type-display truncate text-[28px] leading-[1.1]">
            {me.name}, {me.age}
          </span>
          {me.verified ? <Icon name="verified" size={22} className="ml-1.5 text-trust" label="Verified" /> : null}
        </p>
        <p className="type-body mt-0.5 text-[13px] text-white/78">
          {me.country.flag} {me.country.name} · {genderLabel[me.gender]}
        </p>

        {me.bio.trim() ? (
          <p className="type-body mt-2 line-clamp-2 text-[13.5px] text-white/90">{me.bio}</p>
        ) : (
          <FillGap href="/me/edit#bio" icon="edit_note" label="Add a line about you" />
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {me.intent ? (
            <Glass radius={13} blur={16} className="flex h-[26px] items-center border-pink/40 bg-pink/18 px-2.5 py-0">
              <Icon name={intentInfo[me.intent].icon} size={14} className="text-pink-soft" />
              <span className="type-label ml-1 text-[12px] text-text">Here for: {intentInfo[me.intent].label}</span>
            </Glass>
          ) : (
            <FillGap href="/me/edit#intent" icon="add" label="What are you here for?" chip />
          )}
          {me.interests.slice(0, 3).map((i) => (
            <Glass key={i} radius={13} blur={16} className="flex h-[26px] items-center border-transparent bg-white/12 px-2.5 py-0">
              <span className="type-label text-[12px] text-text">{i}</span>
            </Glass>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A missing part of the profile, shown where it would be, as a dashed link to fill it in. */
function FillGap({ href, icon, label, chip = false }: { href: string; icon: string; label: string; chip?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "type-label inline-flex items-center border border-dashed border-white/30 text-white/80 transition-colors hover:border-pink-soft hover:text-white",
        chip ? "h-[26px] rounded-[13px] px-2.5 text-[12px]" : "mt-2 h-8 rounded-[10px] px-3 text-[12.5px]",
      )}
    >
      <Icon name={icon} size={chip ? 14 : 16} className="mr-1 text-pink-soft" />
      {label}
    </Link>
  );
}

