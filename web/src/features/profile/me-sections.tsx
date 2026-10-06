"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { startSelfieVerification, verificationSubtitle, VerifyPill } from "@/components/shared/selfie-verification";
import { Avatar } from "@/components/ui/avatar";
import { TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { alpha } from "@/lib/colors";
import { ago, duration, thousands } from "@/lib/format";
import { type MatchRecord, matchLengthSeconds } from "@/lib/models";
import { useFollows } from "@/stores/follows";
import { useMatch } from "@/stores/match";
import { useSession, verification } from "@/stores/session";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

import { ProgressCard } from "@/features/engagement/progress-card";
import { WellbeingSection } from "@/features/engagement/wellbeing-section";

import { SignInMethodsCard } from "./sign-in-methods";

const TRUST = { iconColor: "trust" as const, iconBg: alpha("trust", 0.12) };

/** The pages behind the Me menu rows: a back button, a title and the section. */
function MeSection({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  const router = useRouter();
  return (
    <Screen width="sm" header={<AppBar title={title} onBack={() => (history.length > 1 ? router.back() : router.push("/me"))} />} bodyClassName="pt-1">
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

/** Me → Followers & privacy. */
export function PrivacyPage() {
  return (
    <MeSection title="Followers & privacy">
      <FollowSettingsCard />
    </MeSection>
  );
}

/** Me → Recent matches: your last calls; tap one to see their profile. */
export function MatchesPage() {
  const history = useMatch((s) => s.history);
  useNow(60_000);
  const recent = [...history].reverse().slice(0, 20);
  return (
    <MeSection title="Recent matches">
      {!recent.length ? (
        <EmptyState className="mt-10" icon="history" title="No calls " accent="yet" body="Your last matches will show up here." />
      ) : (
        recent.map((r, i) => <MatchRow key={r.id} r={r} last={i === recent.length - 1} />)
      )}
    </MeSection>
  );
}

/** Me → Safety & trust (teal): verification, blur, blocked people, help. */
export function SafetyPage() {
  const session = useSession();
  const me = session.me;
  const autoBlur = useMatch((s) => s.autoBlur);
  const blocked = useSocial((s) => s.blocked);
  if (!me) return null;
  const v = verification(session);
  const unblockAll = async () => {
    for (const id of [...blocked]) await useSocial.getState().unblock(id);
    toast("Everyone unblocked");
  };
  return (
    <MeSection title="Safety & trust">
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
    </MeSection>
  );
}

/** Me → Notifications & wellbeing. */
export function WellbeingPage() {
  return (
    <MeSection title="Notifications & wellbeing">
      <WellbeingSection title={false} />
    </MeSection>
  );
}

/** Me → Account: sign-in methods, e-mail updates, terms, sign out. */
export function AccountPage() {
  const emailUpdates = useSession((s) => s.emailUpdates);
  const signOut = async () => {
    const ok = await confirm({ title: "Sign out?", body: "You can sign back in with the same e-mail any time.", ok: "Sign out", okTone: "bad" });
    if (!ok) return;
    useMatch.getState().releaseCamera();
    await useSession.getState().signOut();
  };
  return (
    <MeSection title="Account">
      <SectionTitle text="Sign-in methods" top={4} />
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
              checked={emailUpdates}
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
    </MeSection>
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
export function FollowSettingsCard() {
  const router = useRouter();
  const s = useFollows((x) => x.settings);
  const save = async (patch: { privateAccount?: boolean; hideStats?: boolean }) => {
    if (!(await useFollows.getState().setPrivacy(patch))) toast("Couldn't save that, try again", { error: true });
  };
  return (
    <div>
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
