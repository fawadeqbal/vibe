"use client";

import { useState } from "react";

import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { ChoiceTile } from "@/components/ui/choice";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { Switch } from "@/components/ui/switch";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Select } from "@/components/ui/text-field";
import { Headline, SectionTitle } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { COUNTRIES } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { type DiscoverFilters, freeOnly, useDiscover, usesExtraFilters, type WantedGender } from "@/stores/discover";
import { openSheet, toast } from "@/stores/ui";

import { TRUST_ROW } from "../match/filters-sheet";

/** "Out of likes": wait for tomorrow, buy a few more, or go VIP. Resolves what they picked. */
export const openOutOfLikes = () => openSheet<"vip" | "buy">((close) => <OutOfLikes onPick={close} />);

function OutOfLikes({ onPick }: { onPick: (v?: "vip" | "buy") => void }) {
  const s = useDiscover((x) => x.status);
  const resets = s?.resetsAt ? comesBackIn(s.resetsAt) : "the morning";
  return (
    <div className="flex flex-col items-center px-6 pt-3 pb-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-pink/14 text-pink">
        <Icon name="favorite" variant="filled" size={30} />
      </span>
      <Headline as="h2" text="You're out of " accent="likes" size={26} className="mt-4" />
      <p className="type-body mt-2 max-w-[340px] text-[14px] leading-[1.5] text-text2">
        You used today&apos;s {s?.freeLikesPerDay ?? 30} free likes. They come back in {resets}. Passing is always free.
      </p>
      <GradientButton label="Get VIP — unlimited likes" icon="workspace_premium" tone="gold" className="mt-6" onClick={() => onPick("vip")} />
      <GhostButton
        label={`${s?.packSize ?? 30} more likes`}
        expand
        className="mt-2.5"
        trailing={<CoinAmount amount={s?.packCost ?? 20} size={13} />}
        onClick={() => onPick("buy")}
      />
      <TextButton className="mt-2 text-text2" onClick={() => onPick()}>
        Wait for tomorrow
      </TextButton>
    </div>
  );
}

/** What the filters sheet asks the screen to do next. */
export type FiltersOutcome = "vip" | "coins" | undefined;

/** Who shows up in your deck. Resolves "vip" (go to VIP) or "coins" (short for a pass). */
export const openDiscoverFilters = () => openSheet<FiltersOutcome>((close) => <FiltersSheet onDone={close} />);

const GENDERS: { value: WantedGender; label: string; icon: string }[] = [
  { value: "anyone", label: "Everyone", icon: "group" },
  { value: "women", label: "Women", icon: "female" },
  { value: "men", label: "Men", icon: "male" },
];

/** "5 hours left", "40 minutes left". */
const left = (until: Date | null) => (until ? `${comesBackIn(until)} left` : "");

function FiltersSheet({ onDone }: { onDone: (v?: FiltersOutcome) => void }) {
  const [f, setF] = useState<DiscoverFilters>(() => useDiscover.getState().filters);
  const [buying, setBuying] = useState(false);
  const status = useDiscover((s) => s.status);
  const access = status?.filters;
  const open = access?.unlocked !== false;
  const needsPass = !open && usesExtraFilters(f);
  const ages = Array.from({ length: 82 }, (_, i) => i + 18);
  const lock = open ? null : <Icon name="lock" size={13} className="text-muted" />;
  const apply = (next = f) => {
    useDiscover.getState().setFilters({ ...next, maxAge: Math.max(next.minAge, next.maxAge) });
    onDone();
  };
  const buyPass = async () => {
    setBuying(true);
    const r = await useDiscover
      .getState()
      .buyFilterPass()
      .catch((e) => (toast(errorMessage(e), { error: true }), null));
    setBuying(false);
    if (r === "coins") return onDone("coins");
    if (r === "ok") {
      toast(`Filters open for ${access?.passHours ?? 24} hours`);
      apply();
    }
  };
  const note =
    access?.reason === "vip"
      ? "VIP: every filter is open."
      : access?.reason === "vibe_hour"
        ? "Vibe Hour: every filter is free right now."
        : access?.reason === "pass"
          ? `Filter pass: every filter is open · ${left(access.passUntil)}.`
          : access?.reason === "free"
            ? "Every filter is free."
            : "Age is free. Gender, country, online now and verified need VIP or a filter pass.";

  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <Headline as="h2" text="Who do you want to " accent="see?" size={24} />
      <p className={cn("type-body mt-1.5 text-[13px] leading-[1.45]", access?.reason === "vip" ? "text-gold" : "text-text2")}>{note}</p>

      <SectionTitle text="Show me" top={20} note={open ? undefined : "VIP or pass"} />
      <div className="flex gap-2">
        {GENDERS.map((g) => {
          const on = f.gender === g.value;
          return (
            <ChoiceTile key={g.value} selected={on} onClick={() => setF({ ...f, gender: g.value })} className="h-[64px] rounded-[18px]">
              <Icon name={g.icon} size={20} className={on ? "text-pink-soft" : "text-text2"} />
              <span className={cn("type-title mt-1 inline-flex items-center gap-1 text-[14px] font-semibold", on ? "text-text" : "text-text2")}>
                {g.label}
                {g.value === "anyone" ? null : lock}
              </span>
            </ChoiceTile>
          );
        })}
      </div>

      <SectionTitle text="Age" top={20} note="Free" />
      <div className="flex items-center gap-3">
        <label className="flex flex-1 flex-col">
          <span className="type-label mb-1 text-[12px] text-muted">From</span>
          <select
            value={f.minAge}
            onChange={(e) => setF({ ...f, minAge: Number(e.target.value) })}
            className="type-body h-12 rounded-[14px] border border-line bg-surface2 px-3 text-[15px] text-text"
          >
            {ages.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col">
          <span className="type-label mb-1 text-[12px] text-muted">To</span>
          <select
            value={f.maxAge}
            onChange={(e) => setF({ ...f, maxAge: Number(e.target.value) })}
            className="type-body h-12 rounded-[14px] border border-line bg-surface2 px-3 text-[15px] text-text"
          >
            {ages.map((a) => (
              <option key={a} value={a} disabled={a < f.minAge}>
                {a === 99 ? "99+" : a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SectionTitle text="Country" top={20} note={open ? undefined : "VIP or pass"} />
      <Select
        label="Country"
        icon="expand_more"
        value={f.countryCode}
        onChange={(v) => setF({ ...f, countryCode: v })}
        options={[{ value: "", label: "🌍  Anywhere" }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag}  ${c.name}` }))]}
        className="[&_select]:h-[52px] [&_select]:pl-4"
      />

      <SectionTitle text="More" top={20} note={open ? undefined : "VIP or pass"} />
      <GroupCard>
        <GroupRow
          icon="radio_button_checked"
          iconColor="ok"
          title="Online now"
          subtitle="Only people on Vibe right now."
          trailing={<Switch checked={f.onlineOnly} onChange={(v) => setF({ ...f, onlineOnly: v })} label="Online now" />}
        />
        <GroupRow
          icon="verified"
          {...TRUST_ROW}
          title="Verified only"
          subtitle="Only selfie-verified people."
          trailing={<Switch checked={f.verifiedOnly} onChange={(v) => setF({ ...f, verifiedOnly: v })} label="Verified only" />}
        />
      </GroupCard>

      {status ? (
        <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-line bg-surface2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="type-title text-[14px] font-semibold">Show me in Discover</p>
            <p className="type-body mt-0.5 text-[12.5px] text-muted">
              {!status.hasPhoto ? "Add a photo first — people without one aren't shown." : "Off: nobody new sees your card. Your matches stay."}
            </p>
          </div>
          <Switch checked={status.showInDiscover} label="Show me in Discover" onChange={(v) => void useDiscover.getState().setVisible(v)} />
        </div>
      ) : null}

      {needsPass && access ? (
        <div className="mt-5 rounded-[20px] border border-pink/30 bg-pink/8 p-4">
          <p className="type-title text-[15px] font-semibold">Open these filters</p>
          <p className="type-body mt-1 text-[13px] leading-[1.45] text-text2">
            A filter pass opens every filter for {access.passHours} hours. VIP gets them free, always.
          </p>
          <GradientButton
            label={buying ? "Opening…" : `Filter pass · ${access.passHours}h`}
            trailing={<CoinAmount amount={access.passCost} size={13} className="text-white" />}
            className="mt-3.5"
            disabled={buying}
            onClick={() => void buyPass()}
          />
          <GhostButton label="Get VIP — every filter free" icon="workspace_premium" expand className="mt-2 text-gold" onClick={() => onDone("vip")} />
          <TextButton className="mt-1.5 w-full text-text2" onClick={() => apply(freeOnly(f))}>
            Just use age
          </TextButton>
        </div>
      ) : (
        <GradientButton label="Show people" className="mt-6" onClick={() => apply()} />
      )}
    </div>
  );
}

/** "3 hours", "40 minutes". */
export function comesBackIn(t: Date, now = Date.now()): string {
  const m = Math.max(1, Math.round((t.getTime() - now) / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}
