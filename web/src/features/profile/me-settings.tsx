"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";

import { startSelfieVerification, verificationSubtitle, VerifyPill } from "@/components/shared/selfie-verification";
import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { type AffiliateStatus } from "@/lib/affiliate";
import { alpha, type Tone } from "@/lib/colors";
import { androidDownloadUrl } from "@/lib/config";
import { compact, until } from "@/lib/format";
import { useAffiliate } from "@/stores/affiliate";
import { useCatalog } from "@/stores/catalog";
import { useDiscover } from "@/stores/discover";
import { useEngagement } from "@/stores/engagement";
import { useFollows } from "@/stores/follows";
import { useMatch } from "@/stores/match";
import { useSession, verification } from "@/stores/session";
import { friendsOf, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

import { InviteCodeField } from "@/features/referrals/invite-code-field";

import { openBlockedPeople } from "./blocked-people";
import { SETTINGS_GROUPS, type SettingsGroupKey } from "./settings-groups";
import { deleteAccountFlow, MeSection, signOutFlow } from "./me-sections";

/** One row of a settings group. */
interface Item {
  key: string;
  icon: string;
  tone?: Tone;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  /** A switch or pill instead of the chevron. */
  trailing?: ReactNode;
  hidden?: boolean;
}


interface Group {
  key: SettingsGroupKey;
  title: string;
  icon: string;
  tone?: Tone;
  /** What's inside, on the group's button. */
  summary: string;
  items: Item[];
}

/**
 * Settings: five groups (account, activity, privacy & safety, wallet, help).
 * Their buttons and Log out sit on Me (`SettingsButtons`); a group opens its
 * own page (`/me/settings/<group>`, `SettingsGroupPage`) with its rows. Rows
 * open their own page and on/off ones switch in place. Same as the app.
 */
function useSettingsGroups(): Group[] {
  const session = useSession();
  const me = session.me;
  const wallet = useWallet((s) => s.wallet);
  const economy = useCatalog((s) => s.economy);
  const level = useEngagement((s) => s.level);
  const follows = useFollows((s) => s.settings);
  const autoBlur = useMatch((s) => s.autoBlur);
  const dataSaver = useMatch((s) => s.dataSaver);
  const showInDiscover = useDiscover((s) => s.status?.showInDiscover ?? true);
  const history = useMatch((s) => s.history);
  const blocked = useSocial((s) => s.blocked);
  const friends = useSocial((s) => friendsOf(s).length);
  const partner = useAffiliate((s) => s.overview?.status);
  const androidApp = useShowAndroidApp();
  useEffect(() => {
    // The partner row says where you are (review, active…); one small read.
    if (!useAffiliate.getState().overview) void useAffiliate.getState().load();
    void useSession.getState().loadVerification();
  }, []);

  const savePrivacy = async (patch: { privateAccount?: boolean; hideStats?: boolean }) => {
    if (!(await useFollows.getState().setPrivacy(patch))) toast("Couldn't save that, try again", { error: true });
  };

  const groups = useMemo<Group[]>(() => {
    if (!me) return [];
    const vip = isVip(wallet);
    const v = verification({ me, verificationState: session.verificationState });
    return [
      {
        key: "account",
        title: SETTINGS_GROUPS.account,
        icon: "manage_accounts",
        summary: "Sign-in, devices, notifications, quiet hours, data saver",
        items: [
          { key: "account", icon: "manage_accounts", title: "Account & sign-in", subtitle: "Sign-in methods, e-mail, delete account", href: "/me/account" },
          { key: "devices", icon: "devices", title: "Devices", subtitle: "Where you're signed in; sign one out", href: "/me/devices" },
          { key: "notifications", icon: "notifications_none", title: "Notifications", subtitle: "Phone, inbox and e-mail, for each kind", href: "/me/notifications" },
          { key: "wellbeing", icon: "bedtime", title: "Time & wellbeing", subtitle: "Quiet hours and break reminders", href: "/me/wellbeing" },
          {
            key: "data",
            icon: "signal_cellular_alt",
            title: "Data saver",
            subtitle: "Calls use less data: smaller, slower video. Voice stays clear.",
           
            trailing: <Switch checked={dataSaver} label="Data saver" onChange={(on) => useMatch.getState().setDataSaver(on)} />,
          },
        ],
      },
      {
        key: "activity",
        title: SETTINGS_GROUPS.activity,
        icon: "history",
        summary: level ? `Level ${level.level} · matches, friends, badges, leaderboard` : "Matches, friends, badges, leaderboard",
        items: [
          { key: "matches", icon: "history", title: "Recent matches", subtitle: history.length ? `${history.length} recent ${history.length === 1 ? "call" : "calls"}` : "Your last calls show up here", href: "/me/matches" },
          {
            key: "follows",
            icon: "people_alt",
            title: "Followers & friends",
            subtitle: `${compact(follows.followers)} ${follows.followers === 1 ? "follower" : "followers"} · ${compact(friends)} ${friends === 1 ? "friend" : "friends"}`,
           
            href: "/me/follows",
          },
          { key: "progress", icon: "emoji_events", tone: "lavender", title: "Progress & badges", subtitle: level ? `Level ${level.level} · ${compact(level.xp)} XP` : "Your level and badges", href: "/me/progress" },
          { key: "leaderboard", icon: "leaderboard", tone: "lavender", title: "Leaderboard", subtitle: "This week's top people", href: "/leaderboard" },
        ],
      },
      {
        key: "privacy",
        title: SETTINGS_GROUPS.privacy,
        icon: "shield",
        tone: "trust",
        summary: `${me.verified ? "Verified" : "Get verified"} · private account, blur, Discover, blocked`,
        items: [
          {
            key: "verify",
            icon: "verified",
            tone: "trust",
            title: me.verified ? "Verified profile" : "Get verified",
            subtitle: verificationSubtitle(v, me.verified),
           
            trailing: me.verified ? <Icon name="check_circle" className="text-trust" /> : v.status === "pending" ? undefined : <VerifyPill busy={session.busy} onClick={() => void startSelfieVerification()} />,
          },
          {
            key: "private",
            icon: "lock",
            title: "Private account",
            subtitle: "New followers need your OK first",
           
            trailing: <Switch checked={follows.privateAccount} label="Private account" onChange={(on) => void savePrivacy({ privateAccount: on })} />,
          },
          {
            key: "stats",
            icon: "visibility",
            title: "Show my numbers",
            subtitle: "Matches, likes and gifts on your profile",
           
            trailing: <Switch checked={!follows.hideStats} label="Show my numbers" onChange={(on) => void savePrivacy({ hideStats: !on })} />,
          },
          {
            key: "blur",
            icon: "blur_on",
            title: "Blur the first 3 seconds",
            subtitle: "Both videos start blurred",
           
            trailing: <Switch checked={autoBlur} label="Blur the first 3 seconds" onChange={(x) => useMatch.getState().setAutoBlur(x)} />,
          },
          {
            key: "discover",
            icon: "visibility",
            title: "Show me in Discover",
            subtitle: "Off: nobody new sees your card",
           
            trailing: (
              <Switch
                checked={showInDiscover}
                label="Show me in Discover"
                onChange={(on) =>
                  void useDiscover
                    .getState()
                    .setVisible(on)
                    .catch(() => toast("Couldn't save that, try again", { error: true }))
                }
              />
            ),
          },
          { key: "blocked", icon: "block", title: "Blocked", subtitle: blocked.length ? `${blocked.length} blocked · tap to unblock` : "Nobody blocked", onClick: () => void openBlockedPeople() },
        ],
      },
      {
        key: "wallet",
        title: SETTINGS_GROUPS.wallet,
        icon: "account_balance_wallet",
        tone: "gold",
        summary: `${compact(wallet.coins)} coins · ${compact(wallet.gems)} gems · VIP, cash out, invites`,
        items: [
          { key: "wallet", icon: "account_balance_wallet", tone: "gold", title: "Wallet", subtitle: `${compact(wallet.coins)} coins · ${compact(wallet.gems)} gems`, href: "/wallet" },
          { key: "vip", icon: "workspace_premium", tone: "gold", title: vip ? "You are VIP" : "Get VIP", subtitle: vip ? until(wallet.vipUntil!) : "Free filters, no ads, see who liked you", href: "/vip" },
          { key: "cashout", icon: "payments", tone: "gem", title: "Cash out gems", subtitle: "JazzCash, Easypaisa or bank", href: "/wallet/cashout" },
          { key: "invite", icon: "card_giftcard", tone: "gold", title: "Invite friends", subtitle: `Give ${economy.inviteeRewardCoins}, get ${economy.inviteRewardCoins} coins`, href: "/invite" },
          { key: "partner", icon: "campaign", tone: "lavender", title: "Creator partner program", subtitle: partnerSubtitle(partner), href: "/partner" },
        ],
      },
      {
        key: "help",
        title: SETTINGS_GROUPS.help,
        icon: "support_agent",
        summary: "Help & safety centre, the Android app, terms",
        items: [
          { key: "help", icon: "support_agent", tone: "trust", title: "Help & safety centre", subtitle: "Staying safe, the rules, write to us", href: "/me/help" },
          {
            key: "android",
            icon: "android",
            tone: "trust",
            title: "Get the Android app",
            subtitle: "Free download · no Play Store needed",
           
            trailing: <Icon name="download" className="text-muted" />,
            onClick: () => {
              window.location.href = androidDownloadUrl("web_me");
            },
            hidden: !androidApp,
          },
          { key: "legal", icon: "description", title: "Terms & policies", subtitle: "Terms, privacy, guidelines, child safety", href: "/me/legal" },
        ],
      },
    ];
  }, [me, wallet, session.verificationState, session.busy, economy, level, follows, autoBlur, dataSaver, showInDiscover, history.length, blocked.length, friends, partner, androidApp]);
  return groups;
}

const iconBg = (tone?: Tone) => (tone ? alpha(tone === "lavender" ? "violet" : tone, tone === "lavender" ? 0.14 : 0.12) : undefined);

/** Me: the five group buttons, then Log out. */
export function SettingsButtons({ className }: { className?: string }) {
  const router = useRouter();
  const groups = useSettingsGroups();
  if (!groups.length) return null;
  return (
    <section aria-label="Settings" className={className}>
      <GroupCard>
        {groups.map((g) => (
          <GroupRow
            key={g.key}
            icon={g.icon}
            iconColor={g.tone ?? "text2"}
            iconBg={iconBg(g.tone)}
            title={g.title}
            subtitle={g.summary}
            trailing={<Icon name="chevron_right" className="text-muted" />}
            onClick={() => router.push(`/me/settings/${g.key}`)}
          />
        ))}
      </GroupCard>
      <GroupCard className="mt-4" dividerInset={52}>
        <GroupRow bare icon="logout" iconColor="bad" title="Log out" titleColor="bad" onClick={() => void signOutFlow()} />
      </GroupCard>
      <p className="type-body mt-3 text-center text-[11px] text-muted">Vibe web 0.1</p>
    </section>
  );
}

/** Me → one settings group: its rows. */
export function SettingsGroupPage({ group }: { group: SettingsGroupKey }) {
  const router = useRouter();
  const open = useSettingsGroups().find((g) => g.key === group);
  if (!open) return null;
  return (
    <MeSection title={open.title} parent="/me">
      <GroupCard className="mt-2.5">
        {open.items
          .filter((i) => !i.hidden)
          .map((i) => (
            <GroupRow
              key={i.key}
              icon={i.icon}
              iconColor={i.tone ?? "text2"}
              iconBg={iconBg(i.tone)}
              title={i.title}
              subtitle={i.subtitle}
              trailing={i.trailing ?? (i.href || i.onClick ? <Icon name="chevron_right" className="text-muted" /> : undefined)}
              onClick={i.href ? () => router.push(i.href!) : i.onClick}
            />
          ))}
      </GroupCard>
      {open.key === "wallet" ? <InviteCodeField className="mt-2.5" /> : null}
      {open.key === "account" ? (
        <GroupCard className="mt-6" dividerInset={52}>
          <GroupRow bare icon="delete" iconVariant="outlined" iconColor="bad" title="Delete account" titleColor="bad" onClick={() => void deleteAccountFlow()} />
        </GroupCard>
      ) : null}
    </MeSection>
  );
}

/** Not on iPhone/iPad (an APK can't be installed there). Server render: shown. */
const useShowAndroidApp = () =>
  useSyncExternalStore(
    () => () => {},
    () => !/iPhone|iPad|iPod/i.test(navigator.userAgent),
    () => true,
  );

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
