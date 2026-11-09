"use client";

import { create } from "zustand";

import { asMap, type Json } from "@/lib/api/mappers";

import { api } from "./services";

export type WantedGender = "anyone" | "women" | "men";

/** Who you meet: one set for random matches and Discover, saved on your account. */
export interface SharedFilters {
  gender: WantedGender;
  minAge: number;
  maxAge: number;
  /** null = anywhere. */
  countryCode: string | null;
  verifiedOnly: boolean;
}

/** Whether gender and country (the extra filters) are open: VIP, Vibe Hour or a filter pass. */
export interface FilterAccess {
  unlocked: boolean;
  reason: "free" | "vip" | "vibe_hour" | "pass" | null;
  passUntil: Date | null;
  passCost: number;
  passHours: number;
}

export const DEFAULT_FILTERS: SharedFilters = { gender: "anyone", minAge: 18, maxAge: 99, countryCode: null, verifiedOnly: false };
export const LOCKED: FilterAccess = { unlocked: false, reason: null, passUntil: null, passCost: 25, passHours: 24 };

/** Gender or a country: the filters that need VIP, Vibe Hour or a pass. Age and verified only are free. */
export const usesExtraFilters = (f: Pick<SharedFilters, "gender" | "countryCode"> & Partial<SharedFilters>): boolean => f.gender !== "anyone" || !!f.countryCode;
/** The free part (age, verified only) of some filters. */
export const freeOnly = (f: SharedFilters): SharedFilters => ({ ...f, gender: "anyone", countryCode: null });

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function readFilters(m: Json): SharedFilters {
  const minAge = Math.min(99, Math.max(18, num(m.minAge, 18)));
  return {
    gender: m.gender === "women" || m.gender === "men" ? m.gender : "anyone",
    minAge,
    maxAge: Math.max(minAge, Math.min(99, num(m.maxAge, 99))),
    countryCode: typeof m.countryCode === "string" && /^[A-Z]{2}$/.test(m.countryCode) ? m.countryCode : null,
    verifiedOnly: m.verifiedOnly === true,
  };
}

export function readAccess(m: Json): FilterAccess {
  const r = m.reason;
  return {
    unlocked: m.unlocked === true,
    reason: r === "free" || r === "vip" || r === "vibe_hour" || r === "pass" ? r : null,
    passUntil: typeof m.passUntil === "string" ? new Date(m.passUntil) : null,
    passCost: num(m.passCost, 25),
    passHours: num(m.passHours, 24),
  };
}

interface FiltersState {
  filters: SharedFilters;
  access: FilterAccess;
  loaded: boolean;
  load: () => Promise<void>;
  /** Saves at once (the screens update right away); the server's answer has the last word. */
  save: (patch: Partial<SharedFilters>) => Promise<boolean>;
  /** Opens gender and country filters for `passHours`; "coins" when you can't afford it. */
  buyPass: () => Promise<"ok" | "coins" | "error">;
  /** Listeners (match, Discover) that react to a change. */
  changed: number;
  reset: () => void;
}

export const useFilters = create<FiltersState>()((set, get) => {
  const apply = (r: Json) => set((s) => ({ filters: readFilters(asMap(r.filters)), access: readAccess(asMap(r.access)), loaded: true, changed: s.changed }));
  return {
    filters: DEFAULT_FILTERS,
    access: LOCKED,
    loaded: false,
    changed: 0,

    async load() {
      if (!api.hasSession) return;
      try {
        apply(asMap(await api.get("/filters")));
      } catch {}
    },

    async save(patch) {
      const prev = get().filters;
      const next = { ...prev, ...patch };
      next.maxAge = Math.max(next.minAge, next.maxAge);
      set((s) => ({ filters: next, changed: s.changed + 1 }));
      try {
        apply(asMap(await api.put("/filters", next)));
        return true;
      } catch {
        set((s) => ({ filters: prev, changed: s.changed + 1 }));
        return false;
      }
    },

    reset: () => set({ filters: DEFAULT_FILTERS, access: LOCKED, loaded: false }),

    async buyPass() {
      try {
        apply(asMap(await api.post("/filters/pass")));
        set((s) => ({ changed: s.changed + 1 }));
        return "ok";
      } catch (e) {
        const code = (e as { code?: string }).code;
        return code === "INSUFFICIENT_COINS" ? "coins" : "error";
      }
    },
  };
});

/** "Women · 20–30 · Pakistan · Verified": what the chips and the searching screen say. */
export function filterSummary(f: SharedFilters, countryName: (code: string) => string): string {
  return [
    f.gender === "women" ? "Women" : f.gender === "men" ? "Men" : "Anyone",
    f.minAge === 18 && f.maxAge === 99 ? null : ageLabel(f),
    f.countryCode ? countryName(f.countryCode) : "Anywhere",
    f.verifiedOnly ? "Verified only" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const ageLabel = (f: Pick<SharedFilters, "minAge" | "maxAge">) => (f.minAge === 18 && f.maxAge === 99 ? "Any age" : f.maxAge >= 99 ? `${f.minAge}+` : `${f.minAge}–${f.maxAge}`);

/** The match screens' view of the shared filters ({ gender, countryCode, safeMode }). */
export function useMatchFilters() {
  const f = useFilters((s) => s.filters);
  return { gender: f.gender, countryCode: f.countryCode, safeMode: f.verifiedOnly };
}

/** Saves a match-screen change into the shared filters. */
export const saveMatchFilters = (f: { gender: WantedGender; countryCode: string | null; safeMode: boolean }) =>
  useFilters.getState().save({ gender: f.gender, countryCode: f.countryCode, verifiedOnly: f.safeMode });

/** Gender and country are set and open, or not set at all: starting won't be refused. */
export const filtersReady = (s: Pick<FiltersState, "filters" | "access">) => !usesExtraFilters(s.filters) || s.access.unlocked;
