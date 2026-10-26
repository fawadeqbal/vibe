"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { startSelfieVerification } from "@/components/shared/selfie-verification";
import { GradientButton } from "@/components/ui/button";
import { Glass, GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { duration, thousands } from "@/lib/format";
import { genderLabel, intentInfo, isProfileComplete, type Profile } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useFollows } from "@/stores/follows";
import { averageLength, matchesToday, skipRate, useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendsOf, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

import { changeProfilePhoto } from "./change-photo";
import { profileSteps } from "./profile-steps";

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

/* ───────────────────────── Profile progress ───────────────────────── */

/**
 * Replaces the old "Profile incomplete" pill: how far along you are, what's
 * left, one button for the next step, and the coin bonus when it's waiting.
 * Hidden once everything's done and the bonus is claimed.
 */
export function ProfileProgress({ me }: { me: Profile }) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const bonusClaimed = useWallet((s) => s.wallet.profileBonusClaimed);
  const bonus = useCatalog((s) => s.economy.profileCompleteCoins);
  const steps = profileSteps(me);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  // A missing photo has its own prompt on the card above, so the button here moves on to the next gap.
  const action = steps.find((s) => !s.done && s.id !== "photo");
  const bonusReady = !bonusClaimed && isProfileComplete(me);
  if (!next && !bonusReady) return null;

  const claim = async () => {
    setClaiming(true);
    try {
      const r = await useWallet.getState().claimProfileBonus();
      toast(r == null ? "Already claimed" : `+${r} coins`, { error: r == null });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section aria-labelledby="profile-progress" className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-baseline">
        <h2 id="profile-progress" className="type-title flex-1 text-[15px] font-semibold">
          {next ? "Finish your profile" : "Profile complete"}
        </h2>
        <span className="type-number text-[13px] text-text2">
          {done} of {steps.length}
        </span>
      </div>
      <div className="mt-2.5 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Profile progress">
        {steps.map((s) => (
          <span key={s.id} className={cn("h-1.5 flex-1 rounded-full", s.done ? "bg-pink" : "bg-surface3")} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
        {steps.map((s) => (
          <li key={s.id} className={cn("type-label flex items-center text-[12.5px]", s.done ? "text-text2" : "text-muted")}>
            <Icon name={s.done ? "check_circle" : "radio_button_unchecked"} size={15} className={cn("mr-1", s.done ? "text-ok" : "text-muted")} />
            {s.label}
          </li>
        ))}
      </ul>
      {!bonusClaimed ? (
        <p className="type-body mt-3 flex items-center text-[12.5px] text-text2">
          <Icon name="paid" size={15} className="mr-1.5 text-gold" />
          {bonusReady ? (
            <span>
              Your <span className="text-gold">+{bonus} coins</span> bonus is ready.
            </span>
          ) : (
            <span>
              Photo, bio and 3 interests earn <span className="text-gold">+{bonus} coins</span>.
            </span>
          )}
        </p>
      ) : null}
      <div className="mt-3.5 empty:hidden">
        {bonusReady ? (
          <GradientButton label={`Claim +${bonus} coins`} tone="gold" height={46} busy={claiming} onClick={() => void claim()} />
        ) : action ? (
          <GradientButton label={action.action} height={46} onClick={() => router.push(action.href)} />
        ) : null}
      </div>
    </section>
  );
}

/* ───────────────────────── Verification ───────────────────────── */

/**
 * Where you stand on the selfie check, always in view on Me, with the one
 * thing to do next: verify, add a photo first, retry, or nothing (verified).
 */
export function VerificationCard({ me }: { me: Profile }) {
  const v = useSession((s) => s.verificationState);
  const busy = useSession((s) => s.busy);
  useEffect(() => {
    void useSession.getState().loadVerification();
  }, []);

  if (me.verified)
    return (
      <Link href="/me/safety" className="flex items-center rounded-card border border-trust/30 bg-trust/8 px-4 py-3 transition-colors hover:bg-trust/12">
        <Icon name="verified" size={22} className="text-trust" />
        <span className="ml-3 flex-1">
          <span className="type-title block text-[14px] font-semibold text-trust">You&apos;re verified</span>
          <span className="type-body block text-[12px] text-text2">Your badge shows on calls, and people matching &quot;verified only&quot; can meet you.</span>
        </span>
        <Icon name="chevron_right" className="text-muted" />
      </Link>
    );

  const hasPhoto = me.avatarUrl.length > 0;
  const pending = v.status === "pending";
  const rejected = v.status === "rejected";
  const title = pending ? "Your selfie is in review" : rejected ? "Verification didn't go through" : hasPhoto ? "Get verified" : "Verification needs a photo";
  const body = pending
    ? "A person is checking it against your profile photo. We'll let you know."
    : rejected
      ? `${(v.reason ?? "We couldn't match your selfie to your photo.").replace(/\.?$/, ".")} Try again in good light.`
      : hasPhoto
        ? "A quick selfie check, compared with your photo. You get a badge, and people who only meet verified profiles can match with you."
        : "We compare a quick selfie with your profile photo. Add a photo of your face above, then verify here.";

  return (
    <section
      aria-labelledby="verify-title"
      className={cn("rounded-card border p-4", pending || !hasPhoto ? "border-line bg-surface" : "border-trust/35 bg-trust/8")}
    >
      <div className="flex items-start">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-trust/16">
          <Icon name={pending ? "hourglass_top" : rejected ? "gpp_maybe" : "verified_user"} size={22} className="text-trust" />
        </span>
        <span className="ml-3 flex-1">
          <span className="flex items-center">
            <h2 id="verify-title" className="type-title text-[15px] font-semibold">
              {title}
            </h2>
            <span
              className={cn("type-label ml-2 rounded-[8px] px-1.5 py-0.5 text-[10.5px] font-bold", pending ? "bg-warn/14 text-warn" : "bg-white/8 text-text2")}
            >
              {pending ? "In review" : "Not verified"}
            </span>
          </span>
          <span className="type-body mt-1 block text-[12.5px] leading-[1.45] text-text2">{body}</span>
        </span>
      </div>
      {pending || !hasPhoto ? null : (
        <div className="mt-3.5">
          <GradientButton
            label={rejected ? "Try again" : "Verify now"}
            icon="photo_camera_front"
            tone="gem"
            height={46}
            busy={busy}
            onClick={() => void startSelfieVerification()}
          />
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Your numbers ───────────────────────── */

/**
 * Your numbers, each with what it counts. Average call and skip rate come
 * from your recent calls, and the card says how many.
 */
export function StatsCard({ me }: { me: Profile }) {
  const friends = useSocial((s) => friendsOf(s).length);
  const history = useMatch((s) => s.history);
  const hideStats = useFollows((s) => s.settings.hideStats);
  const ended = history.filter((r) => r.endedAt != null).length;
  const avg = averageLength({ history });

  const big = (value: string, label: string, caption: string) => (
    <div className="flex flex-1 flex-col items-center px-1.5 text-center">
      <span className="type-number-lg text-[20px]">{value}</span>
      <span className="type-label mt-0.5 text-[12px] text-text">{label}</span>
      <span className="type-body mt-0.5 text-[11px] leading-[1.3] text-muted">{caption}</span>
    </div>
  );
  const small = (value: string, label: string, caption: string) => (
    <div className="flex flex-1 flex-col items-center px-1.5 text-center">
      <span className="type-number text-[15px] font-semibold text-text">{value}</span>
      <span className="type-label mt-0.5 text-[11.5px] text-text2">{label}</span>
      <span className="type-body mt-0.5 text-[10.5px] leading-[1.3] text-muted">{caption}</span>
    </div>
  );

  return (
    <section aria-labelledby="your-numbers" className="rounded-card border border-line bg-surface">
      <div className="flex items-center px-4 pt-3.5">
        <h2 id="your-numbers" className="type-overline flex-1">
          Your numbers
        </h2>
        <Link href="/me/privacy" className="type-body flex items-center text-[11.5px] text-muted hover:text-text2">
          <Icon name={hideStats ? "visibility_off" : "visibility"} size={13} className="mr-1" />
          {hideStats ? "Only you see these" : "Matches & likes are on your profile"}
        </Link>
      </div>
      <div className="flex py-3.5">
        {big(thousands(me.matches), "Matches", "Video calls you've had")}
        <span className="w-px self-stretch bg-line-soft" />
        {big(thousands(me.likes), "Likes", "People who liked you on a call")}
        <span className="w-px self-stretch bg-line-soft" />
        {big(thousands(friends), "Friends", "Friends you've made on Vibe")}
      </div>
      <div className="h-px bg-line-soft" />
      <div className="flex py-3">
        {small(String(matchesToday({ history })), "Today", "Calls since midnight")}
        {small(ended ? duration(avg) : "–", "Avg call", "How long calls last")}
        {small(history.length ? `${Math.round(skipRate({ history }) * 100)}%` : "–", "Skip rate", "Ended within 10 s")}
      </div>
      <p className="type-body border-t border-line-soft px-4 py-2.5 text-center text-[11px] text-muted">
        {history.length
          ? `Today, avg call and skip rate use your last ${history.length} ${history.length === 1 ? "call" : "calls"}.`
          : "Today, avg call and skip rate fill in after your first call."}
      </p>
    </section>
  );
}
