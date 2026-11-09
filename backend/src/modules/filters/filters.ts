/**
 * One set of filters for random matches and Discover: who you see (gender),
 * how old, from where, and verified only. Age and verified only are always
 * free (safety isn't sold); gender and country are the "extra" filters, open
 * with VIP, in Vibe Hour or with a filter pass.
 */
export type WantedGender = 'anyone' | 'women' | 'men';

export interface SavedFilters {
  gender: WantedGender;
  minAge: number;
  maxAge: number;
  /** null = anywhere. */
  countryCode: string | null;
  verifiedOnly: boolean;
}

export const DEFAULT_FILTERS: SavedFilters = { gender: 'anyone', minAge: 18, maxAge: 99, countryCode: null, verifiedOnly: false };

/** Reads what's stored on the user (older rows have nothing, or bits of it). */
export function readFilters(raw: unknown): SavedFilters {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const gender: WantedGender = r.gender === 'women' || r.gender === 'men' ? r.gender : 'anyone';
  const age = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(99, Math.max(18, Math.round(v))) : d);
  const minAge = age(r.minAge, 18);
  const maxAge = Math.max(minAge, age(r.maxAge, 99));
  const countryCode = typeof r.countryCode === 'string' && /^[A-Z]{2}$/.test(r.countryCode) ? r.countryCode : null;
  return { gender, minAge, maxAge, countryCode, verifiedOnly: r.verifiedOnly === true };
}

/** Gender or a country: the filters that need VIP, Vibe Hour or a pass. */
export const usesExtraFilters = (f: Pick<SavedFilters, 'gender' | 'countryCode'> & Partial<SavedFilters>): boolean => f.gender !== 'anyone' || !!f.countryCode;

export interface FilterAccess {
  /** Extra filters open right now. */
  unlocked: boolean;
  /** Why: everyone (rule off), VIP, Vibe Hour, or a pass bought until `passUntil`. */
  reason: 'free' | 'vip' | 'vibe_hour' | 'pass' | null;
  passUntil: string | null;
  passCost: number;
  passHours: number;
}
