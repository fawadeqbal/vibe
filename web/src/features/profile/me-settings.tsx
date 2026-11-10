"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { startSelfieVerification, verificationSubtitle, VerifyPill } from "@/components/shared/selfie-verification";
import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { SectionTitle } from "@/components/ui/typography";
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
import { deleteAccountFlow, MeSection, signOutFlow } from "./me-sections";

/** One row of the menu: what it shows, plus words people might search for. */
interface Item {
  key: string;
  icon: string;
  tone?: Tone;
  title: string;
  subtitle?: string;
  /** Extra search words ("password", "email"…). */
  words?: string;
  href?: string;
  onClick?: () => void;
  /** A switch or pill instead of the chevron. */
  trailing?: ReactNode;
  hidden?: boolean;
}

interface Group {
  title: string;
  items: Item[];
}

/**
 * Settings and activity (Me → ☰): everything that isn't your profile, in
 * five groups people know from other apps, with a search on top. Rows open
 * their own page (Back returns here), and the simple on/off ones switch
 * right in the row.
 */
export function SettingsMenuPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const session = useSession();
  const me = session.me;
  const wallet = useWallet((s) => s.wallet);
  const economy = useCatalog((s) => s.economy);
  const level = useEngagement((s) => s.level);
  const follows = useFollows((s) => s.settings);
  const autoBlur = useMatch((s) => s.autoBlur);
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
        title: "Your account",
        items: [
          { key: "account", icon: "manage_accounts", title: "Account & sign-in", subtitle: "Sign-in methods, e-mail, delete account", words: "email password google apple facebook login delete", href: "/me/account" },
          { key: "notifications", icon: "notifications_none", title: "Notifications", subtitle: "Phone, inbox and e-mail, for each kind", words: "push alerts sounds email", href: "/me/notifications" },
          { key: "wellbeing", icon: "bedtime", title: "Time & wellbeing", subtitle: "Quiet hours and break reminders", words: "quiet hours break reminder vibe hour sleep", href: "/me/wellbeing" },
        ],
      },
      {
        title: "Your activity",
        items: [
          { key: "matches", icon: "history", title: "Recent matches", subtitle: history.length ? `${history.length} recent ${history.length === 1 ? "call" : "calls"}` : "Your last calls show up here", words: "history calls", href: "/me/matches" },
          {
            key: "follows",
            icon: "people_alt",
            title: "Followers & friends",
            subtitle: `${compact(follows.followers)} ${follows.followers === 1 ? "follower" : "followers"} · ${compact(friends)} ${friends === 1 ? "friend" : "friends"}`,
            words: "following requests",
            href: "/me/follows",
          },
          { key: "progress", icon: "emoji_events", tone: "lavender", title: "Progress & badges", subtitle: level ? `Level ${level.level} · ${compact(level.xp)} XP` : "Your level and badges", words: "xp level streak", href: "/me/progress" },
          { key: "leaderboard", icon: "leaderboard", tone: "lavender", title: "Leaderboard", subtitle: "This week's top people", words: "ranking top", href: "/leaderboard" },
        ],
      },
      {
        title: "Privacy & safety",
        items: [
          {
            key: "verify",
            icon: "verified",
            tone: "trust",
            title: me.verified ? "Verified profile" : "Get verified",
            subtitle: verificationSubtitle(v, me.verified),
            words: "selfie badge",
            trailing: me.verified ? <Icon name="check_circle" className="text-trust" /> : v.status === "pending" ? undefined : <VerifyPill busy={session.busy} onClick={() => void startSelfieVerification()} />,
          },
          {
            key: "private",
            icon: "lock",
            title: "Private account",
            subtitle: "New followers need your OK first",
            words: "privacy followers approve",
            trailing: <Switch checked={follows.privateAccount} label="Private account" onChange={(on) => void savePrivacy({ privateAccount: on })} />,
          },
          {
            key: "stats",
            icon: "visibility",
            title: "Show my numbers",
            subtitle: "Matches, likes and gifts on your profile",
            words: "stats hide privacy",
            trailing: <Switch checked={!follows.hideStats} label="Show my numbers" onChange={(on) => void savePrivacy({ hideStats: !on })} />,
          },
          {
            key: "blur",
            icon: "blur_on",
            title: "Blur the first 3 seconds",
            subtitle: "Both videos start blurred",
            words: "safety video",
            trailing: <Switch checked={autoBlur} label="Blur the first 3 seconds" onChange={(x) => useMatch.getState().setAutoBlur(x)} />,
          },
          {
            key: "discover",
            icon: "visibility",
            title: "Show me in Discover",
            subtitle: "Off: nobody new sees your card",
            words: "hide visible discover card",
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
          { key: "blocked", icon: "block", title: "Blocked", subtitle: blocked.length ? `${blocked.length} blocked · tap to unblock` : "Nobody blocked", words: "unblock block", onClick: () => void openBlockedPeople() },
        ],
      },
      {
        title: "Wallet & invites",
        items: [
          { key: "wallet", icon: "account_balance_wallet", tone: "gold", title: "Wallet", subtitle: `${compact(wallet.coins)} coins · ${compact(wallet.gems)} gems`, words: "coins gems buy money", href: "/wallet" },
          { key: "vip", icon: "workspace_premium", tone: "gold", title: vip ? "You are VIP" : "Get VIP", subtitle: vip ? until(wallet.vipUntil!) : "Free filters, no ads, see who liked you", words: "premium subscription", href: "/vip" },
          { key: "cashout", icon: "payments", tone: "gem", title: "Cash out gems", subtitle: "JazzCash, Easypaisa or bank", words: "withdraw money payout", href: "/wallet/cashout" },
          { key: "invite", icon: "card_giftcard", tone: "gold", title: "Invite friends", subtitle: `Give ${economy.inviteeRewardCoins}, get ${economy.inviteRewardCoins} coins`, words: "referral code share", href: "/invite" },
          { key: "partner", icon: "campaign", tone: "lavender", title: "Creator partner program", subtitle: partnerSubtitle(partner), words: "affiliate earn creator", href: "/partner" },
        ],
      },
      {
        title: "Help & about",
        items: [
          { key: "help", icon: "support_agent", tone: "trust", title: "Help & safety centre", subtitle: "Staying safe, the rules, write to us", words: "support report contact", href: "/me/help" },
          {
            key: "android",
            icon: "android",
            tone: "trust",
            title: "Get the Android app",
            subtitle: "Free download · no Play Store needed",
            words: "apk download phone",
            trailing: <Icon name="download" className="text-muted" />,
            onClick: () => {
              window.location.href = androidDownloadUrl("web_me");
            },
            hidden: !androidApp,
          },
          { key: "legal", icon: "description", title: "Terms & policies", subtitle: "Terms, privacy, guidelines, child safety", words: "legal terms privacy policy", href: "/me/legal" },
        ],
      },
    ];
  }, [me, wallet, session.verificationState, session.busy, economy, level, follows, autoBlur, showInDiscover, history.length, blocked.length, friends, partner, androidApp]);

  if (!me) return null;
  const needle = q.trim().toLowerCase();
  const matches = (i: Item) => !needle || `${i.title} ${i.subtitle ?? ""} ${i.words ?? ""}`.toLowerCase().includes(needle);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden && matches(i)) })).filter((g) => g.items.length);

  return (
    <MeSection
      title="Settings and activity"
      parent="/me"
      pinned={
        <label className="relative mt-1 block">
          <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search settings"
            className="type-body h-11 w-full rounded-[14px] border border-line bg-surface2 pr-4 pl-11 text-[15px] text-text outline-none placeholder:text-muted focus:border-violet"
          />
        </label>
      }
    >
      {shown.map((g, gi) => (
        <section key={g.title} aria-label={g.title}>
          <SectionTitle text={g.title} top={gi === 0 ? 10 : 24} bottom={10} />
          <GroupCard>
            {g.items.map((i) => (
              <GroupRow
                key={i.key}
                icon={i.icon}
                iconColor={i.tone ?? "text2"}
                iconBg={i.tone ? alpha(i.tone === "lavender" ? "violet" : i.tone, i.tone === "lavender" ? 0.14 : 0.12) : undefined}
                title={i.title}
                subtitle={i.subtitle}
                trailing={i.trailing ?? (i.href || i.onClick ? <Icon name="chevron_right" className="text-muted" /> : undefined)}
                onClick={i.href ? () => router.push(i.href!) : i.onClick}
              />
            ))}
          </GroupCard>
          {g.title === "Wallet & invites" && !needle ? <InviteCodeField className="mt-2.5" /> : null}
        </section>
      ))}

      {needle && !shown.length ? <p className="type-body mt-10 text-center text-[14px] text-text2">Nothing matches “{q.trim()}”.</p> : null}

      {!needle ? (
        <>
          <GroupCard className="mt-6" dividerInset={52}>
            <GroupRow bare icon="logout" iconColor="bad" title="Log out" titleColor="bad" onClick={() => void signOutFlow()} />
            <GroupRow bare icon="delete" iconVariant="outlined" iconColor="bad" title="Delete account" titleColor="bad" onClick={() => void deleteAccountFlow()} />
          </GroupCard>
          <p className="type-body mt-4 text-center text-[11px] text-muted">Vibe web 0.1</p>
        </>
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
