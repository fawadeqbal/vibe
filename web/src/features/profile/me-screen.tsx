"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { useIsDesktop } from "@/hooks/use-media-query";
import { CoinChip } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { useWallet } from "@/stores/wallet";

import { MeDesktop } from "./me-desktop";
import { SettingsButtons } from "./me-settings";
import { CompleteProfile, ProfileHeader, RecentMatches } from "./me-overview";

/**
 * You, laid out like the profile pages people already know: photo and
 * your three numbers, name and bio, Edit / Share / Preview, then what's
 * left to fill in and your last matches (`me-overview.tsx`). Below them,
 * the five settings groups and Log out (`me-settings.tsx`); each group
 * opens its own page. Same structure as the app.
 */
export function MeScreen() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const wallet = useWallet((s) => s.wallet);
  const desktop = useIsDesktop();
  useEffect(() => {
    if (!useMatch.getState().history.length) void useMatch.getState().load();
  }, []);
  if (!me) return null;

  if (desktop)
    return (
      <Screen
        width="xl"
        header={
          <PageHeader
            title="Me"
            actions={
              <CoinChip coins={wallet.coins} onClick={() => router.push("/wallet")} showPlus={false} />
            }
          />
        }
      >
        <MeDesktop me={me} />
      </Screen>
    );

  return (
    <Screen
      width="wide"
      header={
        <PageHeader
          title="Me"
          actions={
            <CoinChip coins={wallet.coins} onClick={() => router.push("/wallet")} showPlus={false} />
          }
        />
      }
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <ProfileHeader me={me} />
          <CompleteProfile me={me} />
          <RecentMatches />
        </div>

        <SettingsButtons className="mt-[26px] lg:sticky lg:top-2 lg:mt-2" />
      </div>
    </Screen>
  );
}
