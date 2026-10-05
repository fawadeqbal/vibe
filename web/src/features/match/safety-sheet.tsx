"use client";

import { startSelfieVerification, VerifyPill } from "@/components/shared/selfie-verification";
import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Headline, SectionTitle } from "@/components/ui/typography";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

import { TRUST_ROW } from "./filters-sheet";

/** The lobby's Safety shortcut: every trust control in one place, in teal. */
export const openSafetySheet = () => openSheet<void>(() => <SafetySheet />);

function SafetySheet() {
  const filters = useMatch((s) => s.filters);
  const autoBlur = useMatch((s) => s.autoBlur);
  const me = useSession((s) => s.me);
  const busy = useSession((s) => s.busy);
  const vip = useWallet((s) => isVip(s.wallet));
  const verified = me?.verified === true;

  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <div className="flex items-center">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-trust/14">
          <Icon name="shield" className="text-trust" />
        </span>
        <div className="ml-3.5 flex-1">
          <Headline as="h2" text="Safety, " accent="built in" size={24} />
        </div>
      </div>
      <p className="type-body mt-2.5 text-[13px] leading-[1.45] text-text2">Report and block are always top-right during a call. Our team reviews every report.</p>

      <SectionTitle text="Who you meet" top={22} />
      <GroupCard className="border-trust/22">
        <GroupRow
          icon="verified"
          {...TRUST_ROW}
          title="Verified only"
          subtitle="Only match with selfie-verified people. Free."
          trailing={<Switch checked={filters.safeMode} onChange={(v) => useMatch.getState().setFilters({ ...filters, safeMode: v })} label="Verified only" />}
        />
        <GroupRow
          icon="blur_on"
          title="Blur the first 3 seconds"
          subtitle={vip ? "Off for VIP by default; you can keep it on." : "Both videos start blurred."}
          trailing={<Switch checked={autoBlur} onChange={(v) => useMatch.getState().setAutoBlur(v)} label="Blur the first 3 seconds" />}
        />
      </GroupCard>

      <SectionTitle text="Your profile" top={22} />
      <GroupCard>
        <GroupRow
          icon="verified"
          iconVariant={verified ? "round" : "outlined"}
          {...TRUST_ROW}
          title={verified ? "You are verified" : "Verify your profile"}
          subtitle={verified ? "People in safe mode can match with you." : "Quick selfie check. More matches."}
          trailing={verified ? <Icon name="check_circle" className="text-trust" /> : <VerifyPill busy={busy} onClick={() => void startSelfieVerification()} />}
        />
        <GroupRow icon="support_agent" title="Help and safety" trailing={<Icon name="chevron_right" className="text-muted" />} onClick={() => toast("The help centre opens here soon")} />
      </GroupCard>
    </div>
  );
}
