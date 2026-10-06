"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { ChoiceTile } from "@/components/ui/choice";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/text-field";
import { Headline, SectionTitle } from "@/components/ui/typography";
import { COUNTRIES } from "@/lib/catalog";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import type { GenderFilter, MatchFilters } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { isVibeHour, useEngagement } from "@/stores/engagement";
import { useMatch } from "@/stores/match";
import { openSheet } from "@/stores/ui";
import { filterCost, isVip, useWallet } from "@/stores/wallet";

import { genderFilterIcon, genderFilterLabel } from "./labels";

/**
 * Who to match with. Paid filters show their price in gold; VIP shows
 * "free"; the trust filter (verified only) is teal and always free.
 */
export const openFiltersSheet = () => openSheet<void>((close) => <FiltersSheet onDone={() => close()} />);

/** Trust controls shared by the filters and safety sheets. */
export const TRUST_ROW = { iconColor: "trust" as const, iconBg: alpha("trust", 0.12) };

function FiltersSheet({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const vip = useWallet((s) => isVip(s.wallet));
  const vibeHour = useEngagement((s) => isVibeHour(s));
  const e = useCatalog((s) => s.economy);
  const [f, setF] = useState<MatchFilters>(() => useMatch.getState().filters);
  const [autoBlur, setAutoBlur] = useState(() => useMatch.getState().autoBlur);
  const cost = filterCost(f, vip || vibeHour);
  const free = vip || vibeHour;

  const seg = (g: GenderFilter, price: number | null) => {
    const on = f.gender === g;
    return (
      <ChoiceTile key={g} selected={on} onClick={() => setF({ ...f, gender: g })} className="h-[72px] rounded-[18px]">
        <Icon name={genderFilterIcon[g]} size={20} className={on ? "text-pink-soft" : "text-text2"} />
        <span className={cn("type-title mt-1 text-[14px] font-semibold", on ? "text-text" : "text-text2")}>{genderFilterLabel[g]}</span>
        <span className="mt-0.5 flex h-[13px] items-center">{price == null || free ? <span className="type-label text-[11px] text-ok">free</span> : <CoinAmount amount={price} size={11} />}</span>
      </ChoiceTile>
    );
  };

  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <Headline as="h2" text="Who do you want to " accent="meet?" size={24} />
      <p className="type-body mt-1.5 text-[13px] leading-[1.45] text-text2">
        {vip ? "VIP: every filter is free." : vibeHour ? "Vibe Hour: every filter is free for everyone right now." : "Gender and country filters cost coins per match. VIP makes them free."}
      </p>

      <SectionTitle text="Gender" top={22} />
      <div className="flex gap-2">
        {seg("anyone", null)}
        {seg("women", e.genderFilterCost)}
        {seg("men", e.genderFilterCost)}
      </div>

      <SectionTitle text="Country" top={22} note={vip ? "Free with VIP" : vibeHour ? "Free during Vibe Hour" : `${e.regionFilterCost} coins per match`} />
      <Select
        label="Country"
        icon="expand_more"
        value={f.countryCode ?? ""}
        onChange={(v) => setF({ ...f, countryCode: v || null })}
        options={[{ value: "", label: "🌍  Anywhere" }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag}  ${c.name}` }))]}
        className="[&_select]:h-[52px] [&_select]:pl-4"
      />

      <SectionTitle text="Safety" top={22} />
      <GroupCard className="border-trust/22">
        <GroupRow
          icon="verified"
          {...TRUST_ROW}
          title="Verified only"
          subtitle="Only match with selfie-verified people. Free."
          trailing={<Switch checked={f.safeMode} onChange={(v) => setF({ ...f, safeMode: v })} label="Verified only" />}
        />
        <GroupRow
          icon="blur_on"
          title="Blur the first 3 seconds"
          subtitle={vip ? "Off for VIP by default; you can keep it on." : "Both videos start blurred, so nobody gets flashed."}
          trailing={<Switch checked={autoBlur} onChange={setAutoBlur} label="Blur the first 3 seconds" />}
        />
      </GroupCard>

      <div className="mt-5 flex items-center">
        {cost === 0 ? (
          <>
            <Icon name="check_circle" size={18} className="text-ok" />
            <span className="type-title ml-1.5 text-[15px] font-semibold text-ok">Free to match</span>
          </>
        ) : (
          <>
            <CoinAmount amount={cost} size={15} />
            <span className="type-body ml-1.5 text-[14px] text-text2">per match</span>
          </>
        )}
        <span className="flex-1" />
        {!free && cost > 0 ? (
          <button
            type="button"
            className="flex items-center py-1.5"
            onClick={() => {
              onDone();
              router.push("/vip");
            }}
          >
            <Icon name="workspace_premium" size={16} className="text-gold" />
            <span className="type-label ml-1 text-[13px] text-gold">VIP · filters free</span>
          </button>
        ) : null}
      </div>

      <div className="mt-3.5">
        <GradientButton
          label="Apply"
          onClick={() => {
            const m = useMatch.getState();
            m.setFilters(f);
            m.setAutoBlur(autoBlur);
            onDone();
          }}
        />
      </div>
    </div>
  );
}
