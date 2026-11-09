"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { COUNTRIES } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { ageLabel, DEFAULT_FILTERS, type SharedFilters, useFilters, usesExtraFilters, type WantedGender } from "@/stores/filters";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";

const GENDERS: { value: WantedGender; label: string }[] = [
  { value: "anyone", label: "Anyone" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
];

/**
 * The one filters sheet, the same on Home (random matches) and Discover:
 * who, how old, from where, verified only. Gender and country need VIP or
 * the filter pass; Done offers the pass when they're on but not open.
 */
export const openFiltersSheet = () => openSheet<void>((close) => <FiltersSheet onDone={() => close()} />);

function FiltersSheet({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const saved = useFilters((s) => s.filters);
  const access = useFilters((s) => s.access);
  const myCountry = useSession((s) => s.me?.country.code ?? "PK");
  const [f, setF] = useState<SharedFilters>(saved);
  const [picking, setPicking] = useState(false);
  const set = (p: Partial<SharedFilters>) => setF((x) => ({ ...x, ...p }));
  const mine = COUNTRIES.find((c) => c.code === myCountry);
  const other = f.countryCode && f.countryCode !== myCountry ? COUNTRIES.find((c) => c.code === f.countryCode) : null;

  const done = async () => {
    if (!(await useFilters.getState().save(f))) {
      toast("Couldn't save your filters, try again", { error: true });
      return;
    }
    onDone();
    if (usesExtraFilters(f) && !useFilters.getState().access.unlocked) {
      const r = await openFilterPass();
      if (r === "vip") router.push("/vip");
      if (r === "coins") router.push("/store");
    }
  };

  return (
    <div className="flex flex-col px-5 pt-1 pb-5">
      <h2 className="type-title text-[18px]">Filters</h2>
      <p className="type-body mt-1 text-[13px] text-text2">One set of filters for random matches and Discover.</p>

      <Label text="Show me" top={16} />
      <div role="radiogroup" aria-label="Show me" className="flex rounded-full border border-line bg-surface p-1">
        {GENDERS.map((g) => (
          <button
            key={g.value}
            type="button"
            role="radio"
            aria-checked={f.gender === g.value}
            onClick={() => set({ gender: g.value })}
            className={cn("type-label h-[38px] flex-1 rounded-full text-[14px] transition-colors", f.gender === g.value ? "bg-surface3 text-text" : "text-text2 hover:text-text")}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="mt-[18px] flex items-center justify-between">
        <Label text="Age" top={0} />
        <span className="type-label mb-2 text-[13px] text-text2">{ageLabel(f) === "Any age" ? "18 – 99+" : ageLabel(f).replace("–", " – ")}</span>
      </div>
      <AgeRange min={f.minAge} max={f.maxAge} onChange={(minAge, maxAge) => set({ minAge, maxAge })} />

      <Label text="From" top={14} />
      <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
        <RadioRow icon="public" title="Anywhere" on={!f.countryCode} onClick={() => set({ countryCode: null })} />
        <Divider />
        <RadioRow icon="flag" title={mine?.name ?? myCountry} sub="Your country" on={f.countryCode === myCountry} onClick={() => set({ countryCode: myCountry })} />
        <Divider />
        {picking ? (
          <label className="flex items-center gap-3 px-3.5 py-2.5">
            <Icon name="swap_horiz" size={20} className="text-text2" />
            <select
              autoFocus
              aria-label="Choose a country"
              value={f.countryCode ?? ""}
              onChange={(e) => {
                set({ countryCode: e.target.value || null });
                setPicking(false);
              }}
              className="type-body h-10 min-w-0 flex-1 rounded-[12px] border border-line bg-surface2 px-3 text-[15px] text-text outline-none focus:border-violet"
            >
              <option value="">Choose a country…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-white/3">
            <Icon name="swap_horiz" size={20} className="text-text2" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-title text-[15px] font-semibold">{other ? `${other.flag} ${other.name}` : "Choose a country"}</span>
            </span>
            {other ? <Dot /> : <Icon name="chevron_right" size={18} className="text-muted" />}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-3.5 py-3">
        <Icon name="verified_user" size={20} className="text-text2" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-title text-[15px] font-semibold">Verified people only</span>
          <span className="type-body text-[12px] text-text2">People who passed the selfie check · always free</span>
        </span>
        <Switch checked={f.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} label="Verified people only" />
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-[16px] border border-gold/22 bg-gold/8 px-3.5 py-3">
        <Icon name="workspace_premium" size={20} className="shrink-0 text-gold" />
        <p className="type-body text-[12.5px] leading-[1.45] text-text2">
          {access.reason === "vip" ? (
            <>You&apos;re VIP: every filter is free.</>
          ) : access.reason === "pass" && access.passUntil ? (
            <>Your filter pass is on until {access.passUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</>
          ) : access.reason === "vibe_hour" ? (
            <>Vibe Hour: every filter is free right now.</>
          ) : (
            <>
              Age and verified only are always free. Women or men, or a country: <b className="text-text">free with VIP</b>, or a {access.passCost}-coin filter pass for {access.passHours} hours.
            </>
          )}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[110px_1fr] gap-2.5">
        <TextButton onClick={() => setF(DEFAULT_FILTERS)}>Reset</TextButton>
        <GradientButton label="Done" height={52} onClick={() => void done()} />
      </div>
    </div>
  );
}

/** Gender or country are on but not open: the pass, VIP, or keep the free filters for now. */
export const openFilterPass = () =>
  openSheet<"vip" | "coins" | "ok">((close) => {
    const a = useFilters.getState().access;
    return (
      <div className="flex flex-col px-5 pt-1 pb-5">
        <h2 className="type-title text-[18px]">Turn on gender and country</h2>
        <p className="type-body mt-1.5 text-[13.5px] leading-[1.5] text-text2">
          These filters need VIP or a filter pass. The pass works in random matches and Discover for {a.passHours} hours. Until then you&apos;ll meet anyone, with your age range and verified only.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          <GradientButton
            tone="gold"
            label={`Filter pass · ${a.passCost} coins`}
            height={52}
            onClick={async () => {
              const r = await useFilters.getState().buyPass();
              if (r === "ok") {
                toast(`Filters on for ${a.passHours} hours`);
                close("ok");
              } else if (r === "coins") {
                toast("Not enough coins for the pass", { error: true });
                close("coins");
              } else toast("Couldn't buy the pass, try again", { error: true });
            }}
          />
          <button type="button" onClick={() => close("vip")} className="type-label flex h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 text-[14.5px]">
            <Icon name="workspace_premium" size={18} className="text-gold" />
            Get VIP · every filter free
          </button>
          <TextButton onClick={() => close()}>Not now</TextButton>
        </div>
      </div>
    );
  });

function Label({ text, top }: { text: string; top: number }) {
  return (
    <p className="type-overline mb-2 px-0.5" style={{ marginTop: top }}>
      {text}
    </p>
  );
}

const Divider = () => <div className="ml-[46px] h-px bg-line-soft" />;
const Dot = () => (
  <span className="flex size-[22px] items-center justify-center rounded-full border-2 border-pink">
    <span className="size-2.5 rounded-full bg-pink" />
  </span>
);

function RadioRow({ icon, title, sub, on, onClick }: { icon: string; title: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-white/3">
      <Icon name={icon} size={20} className="text-text2" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-title text-[15px] font-semibold">{title}</span>
        {sub ? <span className="type-body text-[12px] text-text2">{sub}</span> : null}
      </span>
      {on ? <Dot /> : <span className="size-[22px] rounded-full border-2 border-white/25" />}
    </button>
  );
}

/** Two thumbs on one track (two native range inputs, so keys and screen readers work). */
export function AgeRange({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  const pct = (v: number) => ((v - 18) / (99 - 18)) * 100;
  const thumb =
    "pointer-events-none absolute inset-x-0 top-0 h-[34px] w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(0_0_0/.4)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white";
  return (
    <div className="relative mx-1 h-[34px]">
      <span className="absolute inset-x-0 top-[15px] h-1 rounded bg-surface3" />
      <span className="bg-brand absolute top-[15px] h-1 rounded" style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }} />
      <input type="range" aria-label="Youngest age" min={18} max={99} value={min} onChange={(e) => onChange(Math.min(Number(e.target.value), max), max)} className={thumb} />
      <input type="range" aria-label="Oldest age" min={18} max={99} value={max} onChange={(e) => onChange(min, Math.max(Number(e.target.value), min))} className={thumb} />
    </div>
  );
}
