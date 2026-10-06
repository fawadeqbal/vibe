"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { copyText, shareLink } from "@/components/shared/share-card";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton, GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Tag } from "@/components/ui/misc";
import { CoinIcon } from "@/components/ui/money";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { Headline, SectionTitle } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { ago, plural, thousands } from "@/lib/format";
import { inviteMessage, type Milestone, milestoneFill, milestoneRewardLabel, personSteps, type ReferralOverview, type ReferralPerson, rejectReasonLabel, whatsappUrl, withSource } from "@/lib/referrals";
import { useCatalog } from "@/stores/catalog";
import { useReferrals } from "@/stores/referrals";
import { toast } from "@/stores/ui";

import { InviteCodeField } from "./invite-code-field";

/**
 * Invite friends: the deal (catalog values), your link with WhatsApp first,
 * how it works, the milestone track, totals and the people you invited with
 * how far each is. Live over `referral:updated`.
 */
export function InviteScreen() {
  const router = useRouter();
  const ov = useReferrals((s) => s.overview);
  const loading = useReferrals((s) => s.loading);
  const error = useReferrals((s) => s.error);
  const e = useCatalog((s) => s.economy);

  useEffect(() => {
    void useReferrals.getState().load();
  }, []);

  const give = ov?.rewards.inviteeCoins ?? e.inviteeRewardCoins;
  const get = ov?.rewards.inviterCoins ?? e.inviteRewardCoins;
  const calls = ov?.rewards.activationCalls ?? e.referralActivationCalls;
  const verify = ov?.rewards.requireVerified ?? e.referralRequireVerified === 1;

  return (
    <Screen width="sm" header={<AppBar title="Invite friends" onBack={() => router.back()} />} bodyClassName="pt-1">
      <Panel className="relative overflow-hidden px-5 pt-5 pb-5">
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-gold/10 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-1.5" aria-hidden>
          <CoinIcon size={26} />
          <CoinIcon size={20} className="opacity-80" />
          <CoinIcon size={14} className="opacity-60" />
        </div>
        <Headline as="h2" text={`Give ${give}, get `} accent={`${get} coins`} size={30} accentColor="gold" className="relative mt-3" />
        <p className="type-body relative mt-2 text-[14px] leading-[1.5] text-text2">
          Friends get {give} coins when they join with your link. You get {get} once they&apos;re {verify ? "verified and have had" : "active with"} {calls} {plural(calls, "call")}.
        </p>
      </Panel>

      {ov ? <ShareBox ov={ov} give={give} /> : loading ? <Loading /> : error ? <EmptyState icon="cloud_off" title="Couldn't load your invites" body={error} action={<GhostButton label="Try again" onClick={() => void useReferrals.getState().load()} />} /> : null}

      <SectionTitle text="How it works" top={26} />
      <Panel className="p-0">
        <Step n={1} icon="ios_share" title="Share your link" body="WhatsApp, Instagram, anywhere. They can also type your code." />
        <Step n={2} icon="verified" title={verify ? `They verify and have ${calls} ${plural(calls, "call")}` : `They have ${calls} ${plural(calls, "call")}`} body={`Calls of a minute or more count. It keeps the coins for real people.`} />
        <Step n={3} icon="paid" title="You both get coins" body={`${give} for them, ${get} for you${ov && ov.rewards.holdHours > 0 ? `, about ${ov.rewards.holdHours} h later` : ""}.`} last />
      </Panel>

      {ov ? (
        <>
          <SectionTitle text="Milestones" note={ov.next ? `${ov.next.remaining} more to the next` : "All unlocked"} top={26} />
          <MilestoneTrack milestones={ov.milestones} count={ov.stats.rewarded} />

          <SectionTitle text="Your invites" top={26} />
          <Totals ov={ov} />
          <div className="mt-3 flex flex-col">
            {ov.people.length ? (
              ov.people.map((p, i) => <PersonRow key={p.id} p={p} last={i === ov.people.length - 1} />)
            ) : (
              <p className="type-body px-0.5 py-3 text-[13px] text-text2">Nobody yet. Friends show up here as soon as they join.</p>
            )}
          </div>
        </>
      ) : null}

      <InviteCodeField className="mt-6" />

      <Link href="/partner" className="glass relative mt-6 flex items-center rounded-[20px] px-4 py-3.5 transition-[filter] hover:brightness-110">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-violet/14">
          <Icon name="campaign" size={22} className="text-lavender" />
        </span>
        <span className="ml-3.5 min-w-0 flex-1">
          <span className="type-title block text-[14.5px] font-semibold">Creator with an audience?</span>
          <span className="type-body block text-[12px] text-text2">Earn money for the people you bring. Partner program</span>
        </span>
        <Icon name="chevron_right" className="text-muted" />
      </Link>
    </Screen>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-8">
      <Spinner size={28} stroke={3} className="text-text2" />
    </div>
  );
}

/** Your code and link, WhatsApp first; partners also get their creator link. */
function ShareBox({ ov, give }: { ov: ReferralOverview; give: number }) {
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async (text: string, what = "Link copied") => {
    const ok = await copyText(text);
    toast(ok ? what : "Couldn't copy. Long-press the link to copy it.", { error: !ok });
  };
  return (
    <>
      <div className="mt-3 flex items-center rounded-[18px] border border-line bg-surface2 py-1.5 pr-1.5 pl-4">
        <span className="min-w-0 flex-1">
          <span className="type-overline block text-[10px]">Your link · code {ov.code}</span>
          <span className="type-mono mt-0.5 block truncate text-[14px] text-text">{ov.link.replace(/^https?:\/\//, "")}</span>
        </span>
        <CircleIconButton icon="content_copy" label="Copy link" iconSize={18} onClick={() => void copy(ov.link)} />
      </div>
      <div className="mt-3">
        <GradientButton label="Invite on WhatsApp" icon="chat" onClick={() => window.open(whatsappUrl(inviteMessage(withSource(ov.link, "whatsapp"), give)), "_blank", "noopener,noreferrer")} />
      </div>
      <div className="mt-2.5 flex gap-2">
        {canShare ? <GhostButton label="Share…" icon="ios_share" expand className="flex-1" onClick={() => void shareLink({ text: inviteMessage(withSource(ov.link, "share"), give) })} /> : null}
        <GhostButton label="Copy link" icon="link" expand className="flex-1" onClick={() => void copy(ov.link)} />
      </div>
      {ov.affiliate ? (
        <Panel className="mt-3 flex items-center border-violet/30 px-4 py-3">
          <Icon name="campaign" size={22} className="text-lavender" />
          <span className="ml-3 min-w-0 flex-1">
            <span className="type-label block text-[12px] text-lavender">Your creator link · earns money</span>
            <span className="type-mono block truncate text-[13.5px]">{ov.affiliate.link.replace(/^https?:\/\//, "")}</span>
          </span>
          <CircleIconButton icon="content_copy" label="Copy creator link" iconSize={18} onClick={() => void copy(ov.affiliate!.link, "Creator link copied")} />
        </Panel>
      ) : null}
    </>
  );
}

function Step({ n, icon, title, body, last = false }: { n: number; icon: string; title: string; body: string; last?: boolean }) {
  return (
    <div className={cn("flex items-start px-4 py-3.5", !last && "border-b border-line-soft")}>
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white/5">
        <Icon name={icon} size={20} className="text-text2" />
        <span className="type-number absolute -top-1.5 -left-1.5 flex size-[18px] items-center justify-center rounded-full bg-surface3 text-[10.5px] text-text">{n}</span>
      </span>
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="type-title block text-[14.5px] font-semibold">{title}</span>
        <span className="type-body mt-0.5 block text-[12.5px] text-text2">{body}</span>
      </span>
    </div>
  );
}

/** 3 · 10 · 25: a track that fills with friends who became active; reached rewards light up gold. */
function MilestoneTrack({ milestones, count }: { milestones: Milestone[]; count: number }) {
  const fill = milestoneFill(
    milestones.map((m) => m.count),
    count,
  );
  const n = milestones.length;
  return (
    <Panel className="px-4 pt-5 pb-4">
      <div className="relative mx-3 h-2" role="progressbar" aria-valuemin={0} aria-valuemax={milestones[n - 1]?.count ?? 0} aria-valuenow={count} aria-label={`${count} friends active`}>
        <div className="absolute inset-0 rounded-full bg-surface3" />
        <div className="bg-gold-grad absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${fill * 100}%` }} />
        {milestones.map((m, i) => (
          <span
            key={m.count}
            className={cn("absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2", m.reached ? "bg-gold-grad border-transparent" : "border-surface3 bg-surface")}
            style={{ left: `${((i + 1) / n) * 100}%` }}
          >
            <Icon name={m.reward.kind === "vip" ? "workspace_premium" : "paid"} size={15} className={m.reached ? "text-on-gold-icon" : "text-muted"} />
          </span>
        ))}
      </div>
      <div className="relative mx-3 mt-4 h-[40px]">
        {milestones.map((m, i) => {
          const end = i === n - 1;
          return (
            <span
              key={m.count}
              className={cn("absolute top-0 flex flex-col whitespace-nowrap", end ? "-translate-x-full items-end text-right" : "-translate-x-1/2 items-center text-center")}
              style={{ left: end ? "calc(100% + 14px)" : `${((i + 1) / n) * 100}%` }}
            >
              <span className={cn("type-number text-[15px]", m.reached ? "text-gold" : "text-text")}>{m.count}</span>
              <span className="type-body text-[11px] leading-[1.25] text-text2">{milestoneRewardLabel(m.reward)}</span>
            </span>
          );
        })}
      </div>
    </Panel>
  );
}

function Totals({ ov }: { ov: ReferralOverview }) {
  const cell = (value: string, label: string, cls = "text-text") => (
    <div className="flex flex-1 flex-col items-center px-1">
      <span className={cn("type-number-lg text-[20px]", cls)}>{value}</span>
      <span className="type-body mt-0.5 text-[11px] text-muted">{label}</span>
    </div>
  );
  return (
    <div className="glass relative flex rounded-card py-3.5">
      {cell(thousands(ov.stats.joined), "Joined")}
      {cell(thousands(ov.stats.pending), "On the way")}
      {cell(thousands(ov.stats.rewarded), "Active")}
      {cell(thousands(ov.stats.coinsEarned), "Coins earned", "text-gold")}
    </div>
  );
}

function PersonRow({ p, last }: { p: ReferralPerson; last: boolean }) {
  const name = p.profile.name.split(" ")[0] || "New friend";
  const sub =
    p.status === "PENDING"
      ? personSteps(p) || "Getting started"
      : p.status === "QUALIFIED"
        ? "Active · coins on the way"
        : p.status === "REWARDED"
          ? `Active${p.rewardedAt ? ` · ${ago(p.rewardedAt)}` : ""}`
          : rejectReasonLabel(p.rejectReason);
  return (
    <div className={cn("flex items-center py-3", !last && "border-b border-line-soft")}>
      <Avatar url={p.profile.avatarUrl} name={name} size={44} />
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="type-title block truncate text-[15px] font-semibold">{name}</span>
        <span className="type-body mt-px block truncate text-[12px] text-text2">
          {sub} · joined {ago(p.createdAt)}
        </span>
      </span>
      {p.status === "REWARDED" ? (
        <span className="type-number flex h-[26px] items-center rounded-[13px] bg-gold/12 px-2.5 text-[12.5px] text-gold">+{thousands(p.coins)}</span>
      ) : p.status === "QUALIFIED" ? (
        <Tag text="Active" tone="trust" icon="check" />
      ) : p.status === "REJECTED" ? (
        <Tag text="No reward" tone="muted" />
      ) : (
        <Tag text="Joined" tone="lavender" />
      )}
    </div>
  );
}
