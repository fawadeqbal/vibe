"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { CircleIconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { useNow } from "@/hooks/use-now";
import { type AffiliateStatus } from "@/lib/affiliate";
import { alpha } from "@/lib/colors";
import { thousands, until } from "@/lib/format";
import { useAffiliate } from "@/stores/affiliate";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { useFollows } from "@/stores/follows";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { isVip, useWallet } from "@/stores/wallet";

import { InviteCodeField } from "@/features/referrals/invite-code-field";

import { ProfileCard, ProfileProgress, StatsCard, VerificationCard } from "./me-overview";

/**
 * You: your profile shown as the card others see, what's left to fill in,
 * where verification stands and your numbers (`me-overview.tsx`), then one
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
      <div className="flex flex-col gap-3">
        <ProfileCard me={me} vip={vip} />
        <ProfileProgress me={me} />
        <VerificationCard me={me} />
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
          subtitle="Blur, blocking, reports and help"
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
