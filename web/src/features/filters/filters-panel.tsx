"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { COUNTRIES } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { ageLabel, DEFAULT_FILTERS, type SharedFilters, useFilters, usesExtraFilters, type WantedGender } from "@/stores/filters";
import { toast } from "@/stores/ui";

import { AgeRange, openFilterPass } from "./filters-sheet";

const GENDERS: { value: WantedGender; label: string }[] = [
  { value: "anyone", label: "Anyone" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
];

/**
 * Desktop: the filters sheet laid out inline (Home's right column). There is
 * room, so nothing hides behind a button; every change saves on its own (the
 * age slider after a short pause). Gender and country carry a lock until
 * they're open, and a line offers the pass.
 */
export function FiltersPanel({ className }: { className?: string }) {
  const router = useRouter();
  const saved = useFilters((s) => s.filters);
  const unlocked = useFilters((s) => s.access.unlocked);
  const [f, setF] = useState<SharedFilters>(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow changes made elsewhere (the tags' ×, Clear, the phone sheet).
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setF(saved);
  }
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const save = (next: SharedFilters, wait = 0) => {
    setF(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void useFilters
        .getState()
        .save(next)
        .then((ok) => {
          if (!ok) toast("Couldn't save your filters, try again", { error: true });
        });
    }, wait);
  };
  const set = (p: Partial<SharedFilters>, wait = 0) => save({ ...f, ...p }, wait);
  const locked = usesExtraFilters(f) && !unlocked;
  const changed = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);

  const getPass = async () => {
    const r = await openFilterPass();
    if (r === "vip") router.push("/vip");
    if (r === "coins") router.push("/store");
  };

  return (
    <section aria-labelledby="who-you-meet" className={cn("flex flex-col gap-[18px] rounded-[24px] border border-line bg-surface p-[18px] pb-5", className)}>
      <div className="flex items-center">
        <h2 id="who-you-meet" className="type-title flex-1 text-[16px]">
          Who you&apos;ll meet
        </h2>
        {changed ? (
          <button type="button" onClick={() => save(DEFAULT_FILTERS)} className="type-label text-[13px] text-muted hover:text-text">
            Reset
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="type-label text-[13px] text-text2">Show me</span>
        <div role="radiogroup" aria-label="Show me" className="flex gap-0.5 rounded-full border border-line bg-white/4 p-1">
          {GENDERS.map((g) => {
            const on = f.gender === g.value;
            const lock = g.value !== "anyone" && !unlocked;
            return (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={lock ? `${g.label} (needs the filter pass)` : g.label}
                onClick={() => set({ gender: g.value })}
                className={cn(
                  "type-label flex h-[34px] flex-1 items-center justify-center gap-1 rounded-full text-[13.5px] transition-colors",
                  on ? "bg-pink/18 font-bold text-pink-soft shadow-[inset_0_0_0_1px_rgb(255_61_143/.45)]" : "text-text2 hover:text-text",
                )}
              >
                {lock ? <Icon name="lock" size={13} /> : null}
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="type-label text-[13px] text-text2">Age</span>
          <span className="type-number text-[13px] text-text">{ageLabel(f) === "Any age" ? "18 – 99+" : ageLabel(f).replace("–", " – ")}</span>
        </div>
        <AgeRange min={f.minAge} max={f.maxAge} onChange={(minAge, maxAge) => set({ minAge, maxAge }, 450)} />
      </div>

      <label className="flex flex-col gap-2.5">
        <span className="type-label flex items-center gap-1 text-[13px] text-text2">
          Country
          {!unlocked ? <Icon name="lock" size={13} className="text-muted" label="needs the filter pass" /> : null}
        </span>
        <span className="relative flex items-center">
          <Icon name="public" size={18} className="pointer-events-none absolute left-3.5 text-text2" />
          <select
            value={f.countryCode ?? ""}
            onChange={(e) => set({ countryCode: e.target.value || null })}
            className="type-label h-11 w-full appearance-none rounded-[14px] border border-line bg-white/4 pr-10 pl-10 text-[14px] text-text outline-none focus:border-violet"
          >
            <option value="">Anywhere</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
          <Icon name="expand_more" size={18} className="pointer-events-none absolute right-3.5 text-muted" />
        </span>
      </label>

      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-label text-[13px] text-text2">Verified people only</span>
          <span className="type-body text-[12px] text-muted">Fewer matches, more trust · always free</span>
        </span>
        <Switch checked={f.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} label="Verified people only" />
      </div>

      {locked ? (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-pink/25 bg-pink/8 px-3 py-2.5">
          <Icon name="lock" size={16} className="shrink-0 text-pink-soft" />
          <span className="type-body flex-1 text-[12.5px] text-text2">
            Gender and country need the filter pass. Until then you meet anyone in your age range.
          </span>
          <button type="button" onClick={() => void getPass()} className="type-label shrink-0 text-[12.5px] font-bold text-pink-soft hover:brightness-125">
            Get it
          </button>
        </div>
      ) : null}
    </section>
  );
}
