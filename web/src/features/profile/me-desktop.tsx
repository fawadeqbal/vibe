"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { myInviteLink, shareLink } from "@/components/shared/share-card";
import { startSelfieVerification } from "@/components/shared/selfie-verification";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { levelFraction, xpToNext } from "@/lib/engagement";
import { compact, thousands, until } from "@/lib/format";
import { type Badge, genderLabel, isProfileComplete, type Profile } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { useFollows } from "@/stores/follows";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendsOf, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

import { changeProfilePhoto } from "./change-photo";
import { previewProfile } from "./me-overview";
import { profileSteps } from "./profile-steps";

/**
 * Me on a desktop: a profile card across the top with your four numbers,
 * what's left to fill in and your level side by side, your last matches as
 * a grid, and money, VIP, invites and the settings people reach for most in
 * a column on the right. The phone layout is in `me-screen.tsx`.
 */
export function MeDesktop({ me }: { me: Profile }) {
  useEffect(() => {
    const e = useEngagement.getState();
    if (!e.progress) void e.loadProgress();
  }, []);
  return (
    <div className="flex flex-col gap-6 pt-1 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <HeroCard me={me} />
        <div className="grid grid-cols-2 gap-5">
          <ProgressCard me={me} />
          <LevelCard />
        </div>
        <MatchesCard />
      </div>
      <aside aria-label="Money and invites" className="flex shrink-0 flex-col gap-5 xl:sticky xl:top-2 xl:w-[360px]">
        <WalletCard />
        <VipCard />
        <InviteCard />
        <QuickSettings />
      </aside>
    </div>
  );
}

const card = "rounded-[24px] border border-line bg-surface";

function CardHead({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="type-title text-[16px] font-bold">{title}</h3>
      {action && href ? (
        <Link href={href} className="type-label text-[13px] font-semibold text-pink-soft hover:text-pink">
          {action}
        </Link>
      ) : action ? (
        <span className="type-body text-[13px] text-text2">{action}</span>
      ) : null}
    </div>
  );
}

function Bar({ value, label, className }: { value: number; label: string; className: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 overflow-hidden rounded-full bg-surface2">
      <div className={cn("h-full rounded-full transition-[width] duration-500", className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───────────────────────── Profile card ───────────────────────── */

function HeroCard({ me }: { me: Profile }) {
  const router = useRouter();
  const friends = useSocial((s) => friendsOf(s).length);
  const followers = useFollows((s) => s.settings.followers);
  const level = useEngagement((s) => s.level);
  const vip = useWallet((s) => isVip(s.wallet));
  const [uploading, setUploading] = useState(false);
  const hasPhoto = me.avatarUrl.length > 0;
  const meta = [`${me.country.flag} ${me.country.name}`, genderLabel[me.gender], ...(level ? [`Level ${level.level}`] : [])].join(" · ");

  const share = async () => {
    await shareLink({ text: `I'm on Vibe, free video chat with real people. Come say hi${me.name ? ` to ${me.name}` : ""}:`, url: myInviteLink() ?? undefined });
  };

  return (
    <section aria-label="Your profile" className={cn(card, "overflow-hidden rounded-[28px]")}>
      <div
        aria-hidden
        className="h-[120px]"
        style={{ background: "radial-gradient(80% 140% at 20% 0%, rgb(255 61 143 / .35), rgb(139 92 246 / .25) 50%, transparent 100%)" }}
      />
      <div className="-mt-[62px] flex flex-col gap-[18px] px-7 pb-[26px]">
        <div className="flex flex-wrap items-end gap-[22px]">
          <button
            type="button"
            onClick={hasPhoto ? () => void previewProfile(me, vip) : uploading ? undefined : () => void changeProfilePhoto(setUploading)}
            aria-label={hasPhoto ? "See how others see you" : "Add a profile photo"}
            className="bg-brand relative size-[124px] shrink-0 rounded-full p-1"
          >
            <span className="flex size-full items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-surface2">
              {hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatarUrl} alt="" className="size-full object-cover" />
              ) : uploading ? (
                <Spinner size={26} stroke={3} />
              ) : (
                <Icon name="add_a_photo" size={34} className="text-text2" />
              )}
            </span>
            {me.verified ? (
              <span className="absolute right-1 bottom-1 flex size-8 items-center justify-center rounded-full border-[3px] border-surface bg-trust">
                <Icon name="check" size={18} className="text-on-gem" label="Verified" />
              </span>
            ) : null}
          </button>
          <div className="flex min-w-[260px] flex-1 flex-col gap-1.5 pb-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em]">
                {me.name}, {me.age}
              </h2>
              {vip ? <Tag className="bg-gold/15 text-gold" icon="workspace_premium" label="VIP" /> : null}
              {me.verified ? <Tag className="bg-trust/15 text-trust" icon="verified" label="Verified" /> : <Tag className="bg-white/8 text-text2" label="Not verified" />}
            </div>
            <p className="type-body text-[14px] text-text2">{meta}</p>
            {me.bio.trim() ? <p className="type-body line-clamp-2 text-[15px] text-text">{me.bio}</p> : null}
          </div>
          <div className="flex gap-2.5 pb-1.5">
            <button
              type="button"
              onClick={() => router.push("/me/edit")}
              className="bg-brand type-label h-[42px] rounded-full px-[18px] text-[14px] font-bold text-white transition-[filter] hover:brightness-110"
            >
              Edit profile
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="type-label h-[42px] rounded-full border border-white/12 bg-surface2 px-[18px] text-[14px] font-semibold text-text transition-colors hover:bg-white/9"
            >
              Share
            </button>
            <button
              type="button"
              onClick={() => void previewProfile(me, vip)}
              aria-label="See how others see you"
              title="See how others see you"
              className="flex size-[42px] items-center justify-center rounded-full border border-white/12 bg-surface2 text-text transition-colors hover:bg-white/9"
            >
              <Icon name="visibility" size={19} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          <StatTile value={friends} label="Friends" href="/me/friends" />
          <StatTile value={followers} label="Followers" href="/me/follows" />
          <StatTile value={me.likes} label="Likes" href="/me/likes" />
          <StatTile value={me.matches} label="Matches" href="/me/matches" />
        </div>
      </div>
    </section>
  );
}

function Tag({ label, icon, className }: { label: string; icon?: string; className: string }) {
  return (
    <span className={cn("type-label inline-flex h-6 items-center gap-1 rounded-full px-[9px] text-[12px] font-bold", className)}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {label}
    </span>
  );
}

function StatTile({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col gap-0.5 rounded-[18px] bg-surface2 px-4 py-3.5 transition-colors hover:bg-white/8">
      <span className="type-number-lg text-[22px] font-extrabold" title={value >= 10_000 ? thousands(value) : undefined}>
        {compact(value)}
      </span>
      <span className="type-label text-[12.5px] text-text2">{label}</span>
    </Link>
  );
}

/* ───────────────────────── Complete your profile ───────────────────────── */

function ProgressCard({ me }: { me: Profile }) {
  const router = useRouter();
  const v = useSession((s) => s.verificationState);
  const busy = useSession((s) => s.busy);
  const bonusClaimed = useWallet((s) => s.wallet.profileBonusClaimed);
  const bonus = useCatalog((s) => s.economy.profileCompleteCoins);
  const [claiming, setClaiming] = useState(false);
  useEffect(() => {
    void useSession.getState().loadVerification();
  }, []);

  const steps = profileSteps(me);
  const verifyDone = me.verified || v.status === "pending";
  const total = steps.length + 1;
  const done = steps.filter((s) => s.done).length + (verifyDone ? 1 : 0);
  const bonusReady = !bonusClaimed && isProfileComplete(me);
  const next = steps.find((s) => !s.done);
  const hasPhoto = me.avatarUrl.length > 0;

  const claim = async () => {
    setClaiming(true);
    try {
      const r = await useWallet.getState().claimProfileBonus();
      toast(r == null ? "Already claimed" : `+${r} coins`, { error: r == null });
    } finally {
      setClaiming(false);
    }
  };

  const rows: { done: boolean; label: string; icon?: string; action?: ReactNode }[] = [
    {
      done: steps[0].done,
      label: steps[0].done ? "Photo, name and age" : "Add a photo of you",
      action: next?.id === "photo" ? <RowButton label="Add" onClick={() => void changeProfilePhoto(() => undefined)} /> : undefined,
    },
    {
      done: steps.slice(1).every((s) => s.done),
      label: steps.slice(1).every((s) => s.done) ? "Bio, interests and why you're here" : (next && next.id !== "photo" ? next.action : "Bio, interests and why you're here"),
      action: next && next.id !== "photo" ? <RowButton label="Add" onClick={() => router.push(next.href)} /> : undefined,
    },
    {
      done: me.verified,
      icon: "verified_user",
      label: me.verified ? "Verified" : v.status === "pending" ? "Selfie in review" : "Get verified: a quick selfie",
      action:
        me.verified || v.status === "pending" ? undefined : (
          <RowButton label="Verify" busy={busy} disabled={!hasPhoto} onClick={() => void startSelfieVerification()} />
        ),
    },
  ];

  return (
    <section aria-label="Complete your profile" className={cn(card, "flex flex-col gap-3.5 px-[22px] py-5")}>
      <CardHead title={done === total ? "Your profile is complete" : "Complete your profile"} action={`${done} of ${total}`} />
      <Bar value={done / total} label={`Profile ${Math.round((done / total) * 100)}% complete`} className="bg-brand" />
      <ul className="flex flex-col gap-[9px] text-[13.5px]">
        {rows.map((r) => (
          <li key={r.label} className={cn("type-body flex min-h-8 items-center gap-2.5", r.done ? "text-text2" : "font-semibold text-text")}>
            <Icon name={r.done ? "check" : (r.icon ?? "radio_button_unchecked")} size={18} className={r.done ? "text-ok" : r.icon ? "text-trust" : "text-muted"} />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.action}
          </li>
        ))}
      </ul>
      {bonusReady ? (
        <button
          type="button"
          onClick={claiming ? undefined : () => void claim()}
          className="bg-gold-grad type-label flex h-10 items-center justify-center rounded-full text-[13.5px] font-bold text-on-gold hover:brightness-105"
        >
          {claiming ? <Spinner size={16} stroke={2.2} /> : `Claim your +${bonus} coins`}
        </button>
      ) : !bonusClaimed ? (
        <p className="type-body text-[12.5px] text-text2">Finish your profile for +{bonus} coins.</p>
      ) : null}
    </section>
  );
}

function RowButton({ label, onClick, busy = false, disabled = false }: { label: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={busy || disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? "Add a photo first" : undefined}
      className="bg-brand type-label ml-auto flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-45"
    >
      {busy ? <Spinner size={14} stroke={2} /> : label}
    </button>
  );
}

/* ───────────────────────── Level ───────────────────────── */

const NO_BADGES: Badge[] = [];

function LevelCard() {
  const level = useEngagement((s) => s.level);
  const badges = useEngagement((s) => s.progress?.badges ?? NO_BADGES);
  if (!level) {
    return (
      <section aria-label="Your level" className={cn(card, "flex items-center justify-center px-[22px] py-5")}>
        <Spinner size={20} stroke={2.4} />
      </section>
    );
  }
  const earned = badges.filter((b) => b.earned);
  const shown = [...earned, ...badges.filter((b) => !b.earned)].slice(0, 6);
  return (
    <section aria-label="Your level" className={cn(card, "flex flex-col gap-3.5 px-[22px] py-5")}>
      <CardHead title={`Level ${level.level}`} action="Badges" href="/me/progress" />
      <Bar value={levelFraction(level)} label={`${Math.round(levelFraction(level) * 100)}% to level ${level.level + 1}`} className="bg-lavender" />
      <p className="type-body text-[13px] text-text2">
        {thousands(xpToNext(level))} XP to level {level.level + 1}. Good calls, likes and gifts all count.
      </p>
      {shown.length ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((b) => (
            <span
              key={b.id}
              title={b.earned ? b.name : `${b.name} · ${b.progress}/${b.target}`}
              className={cn("flex size-11 items-center justify-center rounded-[14px] text-[20px]", b.earned ? "bg-lavender/14" : "bg-surface2 opacity-45 grayscale")}
            >
              <span aria-hidden>{b.emoji}</span>
              <span className="sr-only">{b.earned ? b.name : `${b.name}, not earned yet`}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ───────────────────────── Recent matches ───────────────────────── */

function dayLabel(t: Date, now = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(t)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return t.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function MatchesCard() {
  const history = useMatch((s) => s.history);
  const seen = new Set<string>();
  const people = [...history].reverse().filter((r) => (seen.has(r.partner.id) ? false : (seen.add(r.partner.id), true)));
  const shown = people.slice(0, people.length > 6 ? 5 : 6);
  const more = people.length - shown.length;
  return (
    <section aria-label="Recent matches" className={cn(card, "flex flex-col gap-3.5 px-[22px] py-5")}>
      <CardHead title="Recent matches" action={people.length ? "See all" : undefined} href="/me/matches" />
      {people.length ? (
        <div className="grid grid-cols-6 gap-3">
          {shown.map((r, i) => (
            <Link
              key={r.partner.id}
              href={`/u/${r.partner.id}`}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-[18px] bg-surface2 px-1.5 py-3 transition-colors hover:bg-white/8"
            >
              <span className={cn("rounded-full", i === 0 && "ring-2 ring-pink ring-offset-0")}>
                <Avatar url={r.partner.avatarUrl} name={r.partner.name} size={56} />
              </span>
              <span className="type-label w-full truncate text-center text-[13px] font-bold">{r.partner.name.split(" ")[0]}</span>
              <span className="type-body text-[11.5px] text-text2">{dayLabel(r.startedAt)}</span>
            </Link>
          ))}
          {more > 0 ? (
            <Link
              href="/me/matches"
              className="type-label flex items-center justify-center rounded-[18px] border border-dashed border-white/14 text-[13px] font-bold text-pink-soft transition-colors hover:bg-white/4"
            >
              +{more} more
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[18px] bg-surface2 px-4 py-3.5">
          <Icon name="videocam" size={22} className="text-pink-soft" />
          <p className="type-body flex-1 text-[13.5px] text-text2">People you meet on calls show up here.</p>
          <Link href="/match" className="type-label text-[13px] font-bold text-pink-soft hover:text-pink">
            Start a call
          </Link>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Right column ───────────────────────── */

function WalletCard() {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  return (
    <section
      aria-label="Wallet"
      className="flex flex-col gap-4 rounded-[24px] border border-line p-[22px]"
      style={{ backgroundImage: "linear-gradient(160deg, #211B30, #16131F)" }}
    >
      <CardHead title="Wallet" action="History" href="/wallet" />
      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/wallet" className="rounded-[18px] bg-gold/10 px-4 py-3.5 hover:bg-gold/14">
          <span className="type-label block text-[12px] text-gold/80">Coins</span>
          <span className="type-number-lg block text-[26px] font-extrabold text-gold">{thousands(wallet.coins)}</span>
        </Link>
        <Link href="/wallet" className="rounded-[18px] bg-trust/10 px-4 py-3.5 hover:bg-trust/14">
          <span className="type-label block text-[12px] text-trust/80">Gems</span>
          <span className="type-number-lg block text-[26px] font-extrabold text-trust">{thousands(wallet.gems)}</span>
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => router.push("/store")}
          className="bg-gold-grad type-label h-[42px] rounded-full text-[13.5px] font-extrabold text-on-gold hover:brightness-105"
        >
          Buy coins
        </button>
        <button
          type="button"
          onClick={() => router.push("/wallet/cashout")}
          className="type-label h-[42px] rounded-full border border-trust/35 text-[13.5px] font-bold text-trust transition-colors hover:bg-trust/8"
        >
          Cash out
        </button>
      </div>
    </section>
  );
}

function SideLink({ href, icon, iconClass, title, subtitle, className, subClass = "text-text2" }: { href: string; icon: string; iconClass: string; title: string; subtitle: string; className?: string; subClass?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-3.5 rounded-[24px] border px-[22px] py-[18px] transition-[filter] hover:brightness-110", className)}>
      <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px]", iconClass)}>
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[15px] font-bold">{title}</span>
        <span className={cn("type-body block truncate text-[12.5px]", subClass)}>{subtitle}</span>
      </span>
      <Icon name="chevron_right" className="text-muted" />
    </Link>
  );
}

function VipCard() {
  const wallet = useWallet((s) => s.wallet);
  const vip = isVip(wallet);
  return (
    <SideLink
      href="/vip"
      icon="workspace_premium"
      iconClass="bg-gold/20 text-gold"
      title={vip ? "You are VIP" : "Get VIP"}
      subtitle={vip ? `${until(wallet.vipUntil!)} · free filters, no ads` : "Free filters, no ads, see who liked you"}
      subClass="text-gold/75"
      className="border-gold/30 bg-[linear-gradient(135deg,rgb(255_200_87/0.16),rgb(240_160_32/0.06))]"
    />
  );
}

function InviteCard() {
  const economy = useCatalog((s) => s.economy);
  return (
    <SideLink
      href="/invite"
      icon="card_giftcard"
      iconClass="bg-pink/16 text-pink-soft"
      title="Invite friends"
      subtitle={`Give ${economy.inviteeRewardCoins} coins, get ${economy.inviteRewardCoins}`}
      className="border-line bg-surface"
    />
  );
}

function QuickSettings() {
  const dataSaver = useMatch((s) => s.dataSaver);
  const row = "flex items-center gap-3 rounded-[16px] px-3.5 py-3 transition-colors hover:bg-white/5";
  return (
    <section aria-label="Quick settings" className={cn(card, "p-2")}>
      <Link href="/me/notifications" className={row}>
        <Icon name="notifications_none" size={20} className="text-text2" />
        <span className="type-label flex-1 text-[14px] font-semibold">Notifications</span>
        <Icon name="chevron_right" size={20} className="text-muted" />
      </Link>
      <Link href="/me/settings/privacy" className={row}>
        <Icon name="shield" size={20} className="text-text2" />
        <span className="type-label flex-1 text-[14px] font-semibold">Privacy and safety</span>
        <Icon name="chevron_right" size={20} className="text-muted" />
      </Link>
      <button type="button" onClick={() => useMatch.getState().setDataSaver(!dataSaver)} aria-pressed={dataSaver} className={cn(row, "w-full text-left")}>
        <Icon name="data_saver_on" size={20} className="text-text2" />
        <span className="type-label flex-1 text-[14px] font-semibold">Data saver</span>
        <span className={cn("type-label text-[12.5px]", dataSaver ? "font-bold text-ok" : "text-text2")}>{dataSaver ? "On" : "Off"}</span>
      </button>
      <Link href="/me/settings" className={row}>
        <Icon name="settings" size={20} className="text-text2" />
        <span className="type-label flex-1 text-[14px] font-semibold">All settings</span>
        <Icon name="chevron_right" size={20} className="text-muted" />
      </Link>
    </section>
  );
}
