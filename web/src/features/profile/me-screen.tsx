"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { CircleIconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CoinChip } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { alpha } from "@/lib/colors";
import { thousands, until } from "@/lib/format";
import { useCatalog } from "@/stores/catalog";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { isVip, useWallet } from "@/stores/wallet";

import { CompleteProfile, ProfileHeader, RecentMatches } from "./me-overview";

/**
 * You, laid out like the profile pages people already know: photo and
 * your three numbers, name and bio, Edit / Share / Preview, then what's
 * left to fill in, your last matches and three shortcuts (`me-overview.tsx`).
 * Everything else lives behind ☰ in Settings and activity (`me-settings.tsx`),
 * one level down, with its own pages below that. Same structure as the app.
 */
export function MeScreen() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const wallet = useWallet((s) => s.wallet);
  const economy = useCatalog((s) => s.economy);
  useEffect(() => {
    if (!useMatch.getState().history.length) void useMatch.getState().load();
  }, []);
  if (!me) return null;
  const vip = isVip(wallet);

  return (
    <Screen
      header={
        <PageHeader
          title="Me"
          actions={
            <div className="flex items-center gap-2">
              <CoinChip coins={wallet.coins} onClick={() => router.push("/wallet")} showPlus={false} />
              <CircleIconButton icon="menu" label="Settings and activity" iconSize={22} className="bg-surface2" onClick={() => router.push("/me/settings")} />
            </div>
          }
        />
      }
    >
      <ProfileHeader me={me} />
      <CompleteProfile me={me} />
      <RecentMatches />

      <GroupCard className="mt-[26px]">
        <Shortcut icon="account_balance_wallet" title="Wallet" subtitle={`${thousands(wallet.coins)} coins · ${thousands(wallet.gems)} gems`} href="/wallet" />
        <Shortcut icon="workspace_premium" title={vip ? "You are VIP" : "Get VIP"} subtitle={vip ? until(wallet.vipUntil!) : "Free filters, no ads, see who liked you"} href="/vip" />
        <Shortcut icon="card_giftcard" title="Invite friends" subtitle={`Give ${economy.inviteeRewardCoins}, get ${economy.inviteRewardCoins} coins`} href="/invite" />
      </GroupCard>
    </Screen>
  );
}

function Shortcut({ icon, title, subtitle, href }: { icon: string; title: string; subtitle: string; href: string }) {
  const router = useRouter();
  return (
    <GroupRow
      icon={icon}
      iconColor="gold"
      iconBg={alpha("gold", 0.12)}
      title={title}
      subtitle={subtitle}
      trailing={<Icon name="chevron_right" className="text-muted" />}
      onClick={() => router.push(href)}
    />
  );
}
