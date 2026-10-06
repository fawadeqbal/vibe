"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { startSelfieVerification, verificationSubtitle, VerifyPill } from "@/components/shared/selfie-verification";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton, TextButton } from "@/components/ui/button";
import { Glass, GlassPill } from "@/components/ui/glass";
import { GradientFill } from "@/components/ui/gradient-fill";
import { Icon } from "@/components/ui/icon";
import { VDivider } from "@/components/ui/misc";
import { CoinIcon, GemIcon } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { GroupCard, GroupRow, Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { alpha } from "@/lib/colors";
import { ago, duration, gemsAsUsd, thousands, until } from "@/lib/format";
import { genderLabel, isProfileComplete, type MatchRecord, matchLengthSeconds, type Profile } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useFollows } from "@/stores/follows";
import { averageLength, matchesToday, skipRate, useMatch } from "@/stores/match";
import { useSession, verification } from "@/stores/session";
import { friendsOf, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

import { ProgressCard } from "@/features/engagement/progress-card";
import { WellbeingSection } from "@/features/engagement/wellbeing-section";

import { SignInMethodsCard } from "./sign-in-methods";

const TRUST = { iconColor: "trust" as const, iconBg: alpha("trust", 0.12) };

/**
 * You: your profile shown as the card others see, your numbers, then Safety
 * & trust (teal) above money (gold), then history and account.
 */
export function MeScreen() {
  const router = useRouter();
  const session = useSession();
  const me = session.me;
  const wallet = useWallet((s) => s.wallet);
  const usdPerGem = useCatalog((s) => s.economy.usdPerGem);
  const autoBlur = useMatch((s) => s.autoBlur);
  const history = useMatch((s) => s.history);
  const blocked = useSocial((s) => s.blocked);
  useNow(60_000);
  if (!me) return null;
  const vip = isVip(wallet);
  const v = verification(session);
  const recent = [...history].reverse().slice(0, 8);

  const signOut = async () => {
    const ok = await confirm({ title: "Sign out?", body: "You can sign back in with the same e-mail any time.", ok: "Sign out", okTone: "bad" });
    if (!ok) return;
    useMatch.getState().releaseCamera();
    await useSession.getState().signOut();
  };

  const unblockAll = async () => {
    for (const id of [...blocked]) await useSocial.getState().unblock(id);
    toast("Everyone unblocked");
  };

  return (
    <Screen
      header={<PageHeader title="Me" actions={<CircleIconButton icon="edit" label="Edit profile" iconSize={20} className="bg-surface2" onClick={() => router.push("/me/edit")} />} />}
    >
      <ProfileCard me={me} vip={vip} />
      <div className="mt-3">
        <StatsCard me={me} />
      </div>
      <FollowSection />
      <ProgressCard />

      <SectionTitle text="Safety & trust" top={26} />
      <GroupCard className="border-trust/22">
        <GroupRow
          icon="verified"
          iconVariant={me.verified ? "round" : "outlined"}
          {...TRUST}
          title={me.verified ? "Verified profile" : "Verify your profile"}
          subtitle={verificationSubtitle(v, me.verified)}
          trailing={me.verified ? <Icon name="check_circle" className="text-trust" /> : <VerifyPill busy={session.busy} onClick={() => void startSelfieVerification()} />}
        />
        <GroupRow icon="blur_on" title="Blur the first 3 seconds" subtitle="Both videos start blurred." trailing={<Switch checked={autoBlur} onChange={(x) => useMatch.getState().setAutoBlur(x)} label="Blur the first 3 seconds" />} />
        {blocked.length ? (
          <GroupRow icon="block" title={`${blocked.length} blocked`} subtitle="They can never match with you." trailing={<TextButton onClick={() => void unblockAll()}>Unblock all</TextButton>} />
        ) : null}
        <GroupRow icon="support_agent" title="Help and safety" trailing={<Icon name="chevron_right" className="text-muted" />} onClick={() => toast("The help centre opens here soon")} />
      </GroupCard>

      <WellbeingSection />

      <SectionTitle text="Wallet" top={26} />
      <div className="flex gap-2.5">
        <BalanceCard label="Coins" icon={<CoinIcon size={14} plain />} value={thousands(wallet.coins)} valueClass="text-gold" href="/wallet" />
        <BalanceCard label="Gems" icon={<GemIcon size={15} />} value={thousands(wallet.gems)} note={`≈ ${gemsAsUsd(wallet.gems, usdPerGem)}`} valueClass="text-gem" href="/wallet" />
      </div>
      <Link href="/vip" className="relative isolate mt-2.5 flex items-center overflow-hidden rounded-[20px] border border-gold/28 px-4 py-3.5 transition-[filter] hover:brightness-110">
        <GradientFill gradient="vipCard" className="-z-10" />
        <Icon name="workspace_premium" size={24} className="text-gold" />
        <span className="ml-3 flex-1">
          <span className="type-title block text-[15px] font-semibold">{vip ? "You are VIP" : "Get VIP"}</span>
          <span className="type-body block text-[12px] text-text2">{vip ? until(wallet.vipUntil!) : "Free filters, no ads, see who liked you"}</span>
        </span>
        <Icon name="chevron_right" className="text-gold" />
      </Link>

      <SectionTitle text="Recent matches" top={26} bottom={4} />
      {!recent.length ? (
        <p className="type-body px-0.5 py-3 text-[13px] text-text2">Your last matches will show up here.</p>
      ) : (
        recent.map((r, i) => <MatchRow key={r.id} r={r} last={i === recent.length - 1} />)
      )}

      <SectionTitle text="Sign-in methods" top={22} />
      <SignInMethodsCard />

      <SectionTitle text="Account" top={22} />
      <GroupCard dividerInset={52}>
        <GroupRow
          bare
          icon="mail_outline"
          title="E-mail updates"
          subtitle="News and offers from Vibe. Sign-in codes always arrive."
          trailing={
            <Switch
              checked={session.emailUpdates}
              label="E-mail updates"
              onChange={async (on) => {
                if (!(await useSession.getState().setEmailUpdates(on))) toast("Couldn't save that, try again", { error: true });
              }}
            />
          }
        />
        <GroupRow bare icon="description" iconVariant="outlined" title="Terms and privacy" trailing={<Icon name="chevron_right" className="text-muted" />} onClick={() => toast("The policy pages open here soon")} />
        <GroupRow bare icon="logout" iconColor="bad" title="Sign out" titleColor="bad" onClick={() => void signOut()} />
      </GroupCard>
      <p className="type-body mt-4 text-center text-[11px] text-muted">Vibe web 0.1</p>
    </Screen>
  );
}

/** "How others see you": your photo as the card, name, bio and interests. */
function ProfileCard({ me, vip }: { me: Profile; vip: boolean }) {
  return (
    <div className="relative h-[330px] overflow-hidden rounded-[28px] border border-line" style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #1A1724)" }}>
      {me.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <Avatar url="" name={me.name} size={120} />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 h-[220px]" style={{ backgroundImage: "linear-gradient(to top, rgb(11 10 16 / .92), rgb(11 10 16 / 0))" }} />
      <div className="absolute top-3 left-3">
        <GlassPill label="How others see you" icon="visibility" height={28} fontSize={11.5} />
      </div>
      {vip ? (
        <div className="absolute top-3 right-3">
          <GlassPill label="VIP" icon="workspace_premium" tint="gold" textColor="gold" height={28} fontSize={11.5} />
        </div>
      ) : null}
      <div className="absolute inset-x-[18px] bottom-4">
        <p className="flex items-center">
          <span className="type-display truncate text-[28px] leading-[1.1]">
            {me.name}, {me.age}
          </span>
          {me.verified ? <Icon name="verified" size={22} className="ml-1.5 text-trust" label="Verified" /> : null}
        </p>
        <p className="type-body mt-0.5 text-[13px] text-white/78">
          {me.country.flag} {me.country.name} · {genderLabel[me.gender]}
        </p>
        {me.bio.trim() ? <p className="type-body mt-2 line-clamp-2 text-[13.5px] text-white/88">{me.bio}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!isProfileComplete(me) ? <GlassPill label="Profile incomplete" icon="info_outline" tint="warn" textColor="warn" height={26} fontSize={12} /> : null}
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

function StatsCard({ me }: { me: Profile }) {
  const friends = useSocial((s) => friendsOf(s).length);
  const m = useMatch();
  const big = (value: string, label: string) => (
    <div className="flex flex-1 flex-col items-center">
      <span className="type-number-lg text-[20px]">{value}</span>
      <span className="type-body mt-0.5 text-[11px] leading-[1.2] text-muted">{label}</span>
    </div>
  );
  const small = (label: string, value: string) => (
    <span className="type-body text-[12px] text-muted">
      {label} <span className="type-number text-[12px] font-semibold text-text">{value}</span>
    </span>
  );
  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex py-4">
        {big(thousands(me.matches), "Matches")}
        <VDivider className="bg-line-soft" />
        {big(thousands(me.likes), "Likes")}
        <VDivider className="bg-line-soft" />
        {big(thousands(friends), "Friends")}
      </div>
      <div className="h-px bg-line-soft" />
      <div className="flex justify-around px-2 py-3">
        {small("Today", String(matchesToday(m)))}
        {small("Avg", duration(averageLength(m)))}
        {small("Skip rate", `${Math.round(skipRate(m) * 100)}%`)}
      </div>
    </div>
  );
}

function BalanceCard({ label, icon, value, note, valueClass, href }: { label: string; icon: ReactNode; value: string; note?: string; valueClass: string; href: string }) {
  return (
    <Link href={href} className="flex-1">
      <Panel className="rounded-[20px] px-4 py-3.5 transition-[filter] hover:brightness-110">
        <span className="flex items-center">
          {icon}
          <span className="type-body ml-1.5 text-[12px] text-muted">{label}</span>
        </span>
        <span className="mt-1.5 flex items-baseline">
          <span className={`type-number-lg truncate text-[22px] ${valueClass}`}>{value}</span>
          {note ? <span className="type-body ml-1.5 text-[12px] text-muted">{note}</span> : null}
        </span>
      </Panel>
    </Link>
  );
}

function MatchRow({ r, last }: { r: MatchRecord; last: boolean }) {
  const bits = [duration(matchLengthSeconds(r)), ago(r.startedAt), ...(r.likedMe ? ["liked you"] : []), ...(r.giftsReceived > 0 ? [`${r.giftsReceived} gift${r.giftsReceived === 1 ? "" : "s"}`] : [])];
  return (
    <Link href={`/u/${r.partner.id}`} className={`flex items-center py-3 transition-opacity hover:opacity-85 ${last ? "" : "border-b border-line-soft"}`}>
      <Avatar url={r.partner.avatarUrl} name={r.partner.name} size={44} />
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="type-title block text-[15px] font-semibold">
          {r.partner.name}, {r.partner.age} {r.partner.country.flag}
        </span>
        <span className="type-body mt-px block text-[12px] text-text2">{bits.join(" · ")}</span>
      </span>
      {r.liked ? <Icon name="favorite" size={18} className="text-pink" /> : null}
    </Link>
  );
}

/** Your followers (only you see the lists) and the two privacy switches. */
function FollowSection() {
  const router = useRouter();
  const s = useFollows((x) => x.settings);
  const save = async (patch: { privateAccount?: boolean; hideStats?: boolean }) => {
    if (!(await useFollows.getState().setPrivacy(patch))) toast("Couldn't save that, try again", { error: true });
  };
  return (
    <div className="mt-2.5">
      <GroupCard dividerInset={52}>
        <GroupRow
          bare
          icon="people_alt"
          title={`${thousands(s.followers)} ${s.followers === 1 ? "follower" : "followers"} · ${thousands(s.following)} following`}
          subtitle="Only you can see these lists."
          trailing={<Icon name="chevron_right" className="text-muted" />}
          onClick={() => router.push("/me/follows")}
        />
        <GroupRow
          bare
          icon="lock"
          iconVariant="outlined"
          title="Private account"
          subtitle="New followers need your OK first."
          trailing={<Switch checked={s.privateAccount} label="Private account" onChange={(on) => void save({ privateAccount: on })} />}
        />
        <GroupRow
          bare
          icon="visibility_off"
          iconVariant="outlined"
          title="Hide my stats"
          subtitle="Matches, likes and gifts stay private."
          trailing={<Switch checked={s.hideStats} label="Hide my stats" onChange={(on) => void save({ hideStats: on })} />}
        />
      </GroupCard>
    </div>
  );
}
