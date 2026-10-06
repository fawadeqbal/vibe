"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { GhostButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Tag } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { Headline } from "@/components/ui/typography";
import { type AffiliateOverview, usdCents } from "@/lib/affiliate";
import { color, type Tone } from "@/lib/colors";
import { date } from "@/lib/format";
import { useAffiliate } from "@/stores/affiliate";
import { useCatalog } from "@/stores/catalog";

import { ApplyForm } from "./apply-form";
import { PartnerDashboard } from "./dashboard";

/**
 * Creator partner program (`/partner`, Me → Creator partner program; the
 * app opens it in the browser): the pitch and the application, the review
 * states, and the dashboard once approved. Live over `affiliate:updated`.
 */
export function PartnerScreen() {
  const router = useRouter();
  const ov = useAffiliate((s) => s.overview);
  const loading = useAffiliate((s) => s.loading);
  const error = useAffiliate((s) => s.error);

  useEffect(() => {
    void useAffiliate.getState().refreshAll();
  }, []);

  return (
    <Screen width="sm" header={<AppBar title="Creator partners" onBack={() => router.back()} />} bodyClassName="pt-1">
      {!ov ? (
        loading || !error ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} stroke={3} className="text-text2" />
          </div>
        ) : (
          <EmptyState icon="cloud_off" title="Couldn't load the program" body={error} action={<GhostButton label="Try again" onClick={() => void useAffiliate.getState().refreshAll()} />} />
        )
      ) : ov.status === "none" ? (
        <>
          <Pitch />
          <ApplyForm />
        </>
      ) : ov.status === "ACTIVE" ? (
        <>
          <Header ov={ov} />
          <PartnerDashboard ov={ov} />
        </>
      ) : (
        <>
          <StatusCard ov={ov} />
          {ov.status === "SUSPENDED" ? <PartnerDashboard ov={ov} /> : null}
        </>
      )}
    </Screen>
  );
}

function Pitch() {
  const e = useCatalog((s) => s.economy);
  const points = [
    { icon: "percent", text: `${e.affiliateRevSharePercent}% of what the people you bring spend, for ${e.affiliateCommissionMonths} months` },
    { icon: "how_to_reg", text: `${usdCents(e.affiliateCpaUsdCents)} for every person who becomes active` },
    { icon: "insights", text: "Your own code, links per channel and live stats" },
    { icon: "account_balance_wallet", text: `Paid to JazzCash, Easypaisa or your bank from ${usdCents(e.affiliateMinPayoutUsdCents)}` },
  ];
  return (
    <Panel className="relative overflow-hidden px-5 pt-5 pb-4">
      <div className="pointer-events-none absolute -top-20 -right-12 size-56 rounded-full bg-violet/16 blur-2xl" aria-hidden />
      <Tag text="For TikTok, YouTube and Instagram creators" tone="lavender" icon="campaign" />
      <Headline as="h2" text="Get paid for the people " accent="you bring" size={28} accentColor="pink-soft" className="relative mt-3" />
      <ul className="relative mt-4 flex flex-col gap-2.5">
        {points.map((p) => (
          <li key={p.icon} className="flex items-start">
            <Icon name={p.icon} size={18} className="mt-px text-gold" />
            <span className="type-body ml-2.5 text-[13.5px] text-text2">{p.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Header({ ov }: { ov: AffiliateOverview }) {
  const a = ov.affiliate!;
  return (
    <Panel className="flex items-center px-4 py-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-violet/14">
        <Icon name="campaign" className="text-lavender" />
      </span>
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="type-title block truncate text-[16px]">{a.displayName}</span>
        <span className="type-body block text-[12px] text-text2">
          {a.revSharePercent}% share · {usdCents(a.cpaUsdCents)} per active user
        </span>
      </span>
      <Tag text="Active" tone="ok" icon="check" />
    </Panel>
  );
}

const STATES: Record<"PENDING" | "REJECTED" | "SUSPENDED", { icon: string; tone: Tone; title: string; body: string }> = {
  PENDING: { icon: "hourglass_top", tone: "gold", title: "We're reviewing your application", body: "We look at every channel by hand. You'll get a notification when it's decided — usually within a few days." },
  REJECTED: { icon: "do_not_disturb_on", tone: "bad", title: "Not this time", body: "Your application wasn't approved. You can still invite friends and earn coins." },
  SUSPENDED: { icon: "pause_circle", tone: "warn", title: "Your partner account is paused", body: "New commissions are on hold and payouts are paused. Contact support if you think this is a mistake." },
};

function StatusCard({ ov }: { ov: AffiliateOverview }) {
  const s = STATES[ov.status as keyof typeof STATES];
  const a = ov.affiliate;
  return (
    <Panel className="mt-1 px-5 pt-5 pb-5" style={{ borderColor: `color-mix(in srgb, ${color(s.tone)} 30%, transparent)` }}>
      <span className="flex size-12 items-center justify-center rounded-[16px]" style={{ backgroundColor: `color-mix(in srgb, ${color(s.tone)} 14%, transparent)` }}>
        <Icon name={s.icon} size={26} style={{ color: color(s.tone) }} />
      </span>
      <h2 className="type-title-lg mt-4 text-[21px]">{s.title}</h2>
      <p className="type-body mt-1.5 text-[14px] leading-[1.5] text-text2">{s.body}</p>
      {a?.decisionReason && ov.status !== "PENDING" ? (
        <p className="type-body mt-3 rounded-[14px] bg-surface2 px-3.5 py-2.5 text-[13px] text-text">
          <span className="text-muted">Reason: </span>
          {a.decisionReason}
        </p>
      ) : null}
      {a ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
          <span className="type-body text-[12.5px] text-muted">
            Code <span className="type-mono text-text">{a.code}</span>
          </span>
          <span className="type-body text-[12.5px] text-muted">
            Name <span className="text-text">{a.displayName}</span>
          </span>
          {a.appliedAt ? <span className="type-body text-[12.5px] text-muted">Applied {date(a.appliedAt)}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
