"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { Icon } from "@/components/ui/icon";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { SectionTitle } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { alpha } from "@/lib/colors";
import { config } from "@/lib/config";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

import { NotifyChoices } from "@/features/engagement/notify-choices";
import { ProgressCard } from "@/features/engagement/progress-card";
import { WellbeingSection } from "@/features/engagement/wellbeing-section";

import { SignInMethodsCard } from "./sign-in-methods";

const TRUST = { iconColor: "trust" as const, iconBg: alpha("trust", 0.12) };

/**
 * The pages behind Me: a back button, a title and the section. Back steps
 * one level: to where you came from, or (opened straight from a link) to
 * the page above it, which for most of these is Settings and activity.
 */
export function MeSection({ title, children, footer, parent = "/me/settings" }: { title: string; children: ReactNode; footer?: string; parent?: string }) {
  const router = useRouter();
  return (
    <Screen width="sm" header={<AppBar title={title} onBack={() => (history.length > 1 ? router.back() : router.push(parent))} />} bodyClassName="pt-1">
      {children}
      {footer ? <p className="type-body mt-3 px-1 text-[12px] leading-[1.5] text-muted">{footer}</p> : null}
    </Screen>
  );
}

/** Me → Progress & badges. */
export function ProgressPage() {
  return (
    <MeSection title="Progress & badges" footer="Good calls, likes, gifts and streaks earn XP. Badges stay on your profile.">
      <ProgressCard />
    </MeSection>
  );
}

/** Settings → Notifications: for each kind of news, which of phone, inbox and e-mail it reaches. */
export function NotificationsPage() {
  return (
    <MeSection title="Notifications" footer="Account and safety messages always reach you, so they can't be turned off.">
      <NotifyChoices />
    </MeSection>
  );
}

/** Settings → Time & wellbeing: quiet hours, break reminders, the Vibe Hour nudge. */
export function WellbeingPage() {
  return (
    <MeSection title="Time & wellbeing">
      <WellbeingSection title={false} />
    </MeSection>
  );
}

/** Settings → Account & sign-in: how you sign in, e-mail updates, then sign out / delete. */
export function AccountPage() {
  const emailUpdates = useSession((s) => s.emailUpdates);
  return (
    <MeSection title="Account & sign-in">
      <SectionTitle text="Sign-in methods" top={4} />
      <SignInMethodsCard />
      <SectionTitle text="E-mail" top={22} />
      <GroupCard dividerInset={52}>
        <GroupRow
          bare
          icon="mail_outline"
          title="E-mail updates"
          subtitle="News and offers from Vibe. Sign-in codes always arrive."
          trailing={
            <Switch
              checked={emailUpdates}
              label="E-mail updates"
              onChange={async (on) => {
                if (!(await useSession.getState().setEmailUpdates(on))) toast("Couldn't save that, try again", { error: true });
              }}
            />
          }
        />
      </GroupCard>
      <SectionTitle text="Danger zone" top={22} />
      <GroupCard dividerInset={52} className="border-bad/20">
        <GroupRow bare icon="logout" iconColor="bad" title="Log out" titleColor="bad" onClick={() => void signOutFlow()} />
        <GroupRow bare icon="delete" iconVariant="outlined" iconColor="bad" title="Delete account" titleColor="bad" subtitle="Removes your profile for good" onClick={() => void deleteAccountFlow()} />
      </GroupCard>
    </MeSection>
  );
}

/** Settings → Terms & policies: the four public pages on the site. */
export function LegalPage() {
  return (
    <MeSection title="Terms & policies" footer="These open on the Vibe website.">
      <GroupCard dividerInset={52}>
        {LEGAL.map((l) => (
          <GroupRow key={l.slug} bare icon={l.icon} iconVariant="outlined" title={l.title} trailing={<Icon name="open_in_new" size={18} className="text-muted" />} onClick={() => openSitePage(l.slug)} />
        ))}
      </GroupCard>
    </MeSection>
  );
}

const LEGAL = [
  { slug: "terms", icon: "description", title: "Terms of Use" },
  { slug: "privacy", icon: "lock", title: "Privacy Policy" },
  { slug: "guidelines", icon: "groups", title: "Community guidelines" },
  { slug: "child-safety", icon: "shield", title: "Child safety" },
];

/** Settings → Help & safety centre: how to stay safe, the rules, and a person to write to. */
export function HelpPage() {
  return (
    <MeSection title="Help & safety centre" footer="In a call, tap the flag to report someone. A person on our team reviews every report.">
      <GroupCard className="border-trust/22">
        <GroupRow icon="shield" {...TRUST} title="Staying safe on Vibe" subtitle="Blur, blocking, reporting and age rules" trailing={<Icon name="open_in_new" size={18} className="text-muted" />} onClick={() => openSitePage("child-safety")} />
        <GroupRow icon="groups" {...TRUST} title="Community guidelines" subtitle="What's OK and what gets you banned" trailing={<Icon name="open_in_new" size={18} className="text-muted" />} onClick={() => openSitePage("guidelines")} />
        <GroupRow
          icon="mail_outline"
          {...TRUST}
          title="Write to us"
          subtitle={SUPPORT_EMAIL}
          trailing={<Icon name="chevron_right" className="text-muted" />}
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Vibe help")}`;
          }}
        />
      </GroupCard>
    </MeSection>
  );
}

const SUPPORT_EMAIL = "support@vibe.fawadiqbal.dev";

/** A page on the public site (terms, privacy…) in a new tab. */
export const openSitePage = (slug: string) => window.open(`${config.siteUrl}/${slug}/`, "_blank", "noopener");

/** Sign out, after one check. */
export async function signOutFlow() {
  const ok = await confirm({ title: "Log out?", body: "You can sign back in with the same e-mail any time.", ok: "Log out", okTone: "bad" });
  if (!ok) return;
  useMatch.getState().releaseCamera();
  await useSession.getState().signOut();
}

/** Delete the account, after two checks (what's lost, then "for good?"). */
export async function deleteAccountFlow() {
  const first = await confirm({
    title: "Delete your account?",
    body: "Your profile, photos and name are removed and you're signed out. Unused coins, gems and VIP time are lost — cash out gems first. This can't be undone.",
    ok: "Continue",
    okTone: "bad",
  });
  if (!first) return;
  const sure = await confirm({ title: "Delete it for good?", body: "Last check: your Vibe account will be deleted now.", ok: "Delete account", okTone: "bad" });
  if (!sure) return;
  try {
    useMatch.getState().releaseCamera();
    await useSession.getState().deleteAccount();
    toast("Your account was deleted");
  } catch (e) {
    toast(errorMessage(e), { error: true });
  }
}
