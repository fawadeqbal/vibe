"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton } from "@/components/ui/button";
import { Glass, GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { VDivider } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { useNow } from "@/hooks/use-now";
import { type AffiliateStatus } from "@/lib/affiliate";
import { alpha } from "@/lib/colors";
import { duration, thousands, until } from "@/lib/format";
import { genderLabel, isProfileComplete, type Profile } from "@/lib/models";
import { useAffiliate } from "@/stores/affiliate";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { useFollows } from "@/stores/follows";
import { averageLength, matchesToday, skipRate, useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendsOf, useSocial } from "@/stores/social";
import { isVip, useWallet } from "@/stores/wallet";

import { InviteCodeField } from "@/features/referrals/invite-code-field";

/**
 * You: your profile shown as the card others see and your numbers, then one
 * row per area (progress, followers, history, safety, money, invite & earn,
 * settings). Each row opens its own page (`me-sections.tsx`, `/me/*`), so Me
 * stays short instead of one long page. Same structure as the app.
 */
export function MeScreen() {
  const router = useRouter();
  const session = useSession();
  const me = session.me;
  const wallet = useWallet((s) => s.wallet);
  const economy = useCatalog((s) => s.economy);
  const history = useMatch((s) => s.history);
  const level = useEngagement((s) => s.level);
  const follows = useFollows((s) => s.settings);
  const partner = useAffiliate((s) => s.overview?.status);
  useNow(60_000);
  useEffect(() => {
    // The partner row says where you are (review, active…); one small read.
    if (!useAffiliate.getState().overview) void useAffiliate.getState().load();
  }, []);
  if (!me) return null;
  const vip = isVip(wallet);

  return (
    <Screen
      header={<PageHeader title="Me" actions={<CircleIconButton icon="edit" label="Edit profile" iconSize={20} className="bg-surface2" onClick={() => router.push("/me/edit")} />} />}
    >
      <ProfileCard me={me} vip={vip} />
      <div className="mt-3">
        <StatsCard me={me} />
      </div>

      <GroupCard className="mt-[18px]">
        <MenuRow icon="emoji_events" tone="lavender" title="Progress & badges" subtitle={level ? `Level ${level.level} · ${thousands(level.xp)} XP` : "Your level and badges"} href="/me/progress" />
        <MenuRow
          icon="people_alt"
          title="Followers & privacy"
          subtitle={`${thousands(follows.followers)} ${follows.followers === 1 ? "follower" : "followers"} · ${thousands(follows.following)} following`}
          href="/me/privacy"
        />
        <MenuRow icon="history" title="Recent matches" subtitle={history.length ? `${history.length} recent ${history.length === 1 ? "call" : "calls"}` : "Your last calls show up here"} href="/me/matches" />
      </GroupCard>

      <GroupCard className="mt-2.5 border-trust/22">
        <MenuRow
          icon="verified"
          iconVariant={me.verified ? "round" : "outlined"}
          tone="trust"
          title="Safety & trust"
          subtitle={me.verified ? "Verified · blur, blocking and help" : "Not verified yet · blur, blocking and help"}
          href="/me/safety"
        />
      </GroupCard>

      <GroupCard className="mt-2.5">
        <MenuRow icon="account_balance_wallet" tone="gold" title="Wallet" subtitle={`${thousands(wallet.coins)} coins · ${thousands(wallet.gems)} gems`} href="/wallet" />
        <MenuRow icon="workspace_premium" tone="gold" title={vip ? "You are VIP" : "Get VIP"} subtitle={vip ? until(wallet.vipUntil!) : "Free filters, no ads, see who liked you"} href="/vip" />
      </GroupCard>

      <GroupCard className="mt-2.5">
        <MenuRow icon="card_giftcard" tone="gold" title="Invite friends" subtitle={`Give ${economy.inviteeRewardCoins}, get ${economy.inviteRewardCoins} coins`} href="/invite" />
        <MenuRow icon="campaign" tone="lavender" title="Creator partner program" subtitle={partnerSubtitle(partner)} href="/partner" />
      </GroupCard>
      <InviteCodeField className="mt-2.5" />

      <GroupCard className="mt-2.5">
        <MenuRow icon="notifications_none" title="Notifications & wellbeing" subtitle="Quiet hours and break reminders" href="/me/wellbeing" />
        <MenuRow icon="manage_accounts" iconVariant="outlined" title="Account" subtitle="Sign-in methods, e-mail, terms, sign out" href="/me/account" />
      </GroupCard>
      <p className="type-body mt-4 text-center text-[11px] text-muted">Vibe web 0.1</p>
    </Screen>
  );
}

const partnerSubtitle = (s: AffiliateStatus | undefined) =>
  s === "ACTIVE"
    ? "Your stats, links and payouts"
    : s === "PENDING"
      ? "Application under review"
      : s === "SUSPENDED"
        ? "Paused · see why"
        : s === "REJECTED"
          ? "Not approved this time"
          : "Earn money for the people you bring";

/** One Me menu row: tinted icon tile, title, live subtitle, chevron; opens [href]. */
function MenuRow({ icon, iconVariant, tone, title, subtitle, href }: { icon: string; iconVariant?: "round" | "outlined"; tone?: "gold" | "trust" | "lavender"; title: string; subtitle: string; href: string }) {
  const router = useRouter();
  return (
    <GroupRow
      icon={icon}
      iconVariant={iconVariant}
      iconColor={tone ?? "text2"}
      iconBg={tone ? alpha(tone === "lavender" ? "violet" : tone, tone === "lavender" ? 0.14 : 0.12) : undefined}
      title={title}
      subtitle={subtitle}
      trailing={<Icon name="chevron_right" className="text-muted" />}
      onClick={() => router.push(href)}
    />
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
