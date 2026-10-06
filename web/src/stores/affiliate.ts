import { create } from "zustand";

import { newIdempotencyKey } from "@/lib/api/client";
import { asList, asMap } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import {
  type AffiliateOverview,
  affiliateOverview,
  type AffiliatePayout,
  affiliatePayout,
  type AffiliateStats,
  affiliateStats,
  type ApplyInput,
  applyBody,
  type Commission,
  commission,
  type StatsRange,
} from "@/lib/affiliate";
import { normaliseCode } from "@/lib/referrals";

import { api, realtime } from "./services";
import { toast } from "./ui";

/**
 * Creator partner program (`/v1/affiliate`): status and balance, stats for
 * 7/30/90 days, commissions (cursor pages), payouts. `affiliate:updated`
 * re-reads everything that is loaded.
 */
interface AffiliateState {
  overview: AffiliateOverview | null;
  loading: boolean;
  error: string | null;
  range: StatsRange;
  stats: Partial<Record<StatsRange, AffiliateStats>>;
  commissions: Commission[];
  commissionsCursor: string | null;
  commissionsLoaded: boolean;
  loadingMore: boolean;
  payouts: AffiliatePayout[];

  load: () => Promise<void>;
  setRange: (r: StatsRange) => void;
  loadStats: (r?: StatsRange) => Promise<void>;
  loadCommissions: (more?: boolean) => Promise<void>;
  loadPayouts: () => Promise<void>;
  /** `{ code, available, reason }` for the apply form's code field. */
  codeAvailable: (code: string) => Promise<{ code: string | null; available: boolean; reason: string | null }>;
  apply: (input: ApplyInput) => Promise<void>;
  requestPayout: (payoutAccountId: string) => Promise<AffiliatePayout>;
  /** Everything a dashboard shows. */
  refreshAll: () => Promise<void>;
  reset: () => void;
}

const EMPTY = { overview: null, loading: false, error: null, stats: {}, commissions: [], commissionsCursor: null, commissionsLoaded: false, loadingMore: false, payouts: [] };

export const useAffiliate = create<AffiliateState>()((set, get) => ({
  ...EMPTY,
  range: 30,

  async load() {
    if (!api.hasSession) return;
    set({ loading: !get().overview, error: null });
    try {
      set({ overview: affiliateOverview(asMap(await api.get("/affiliate"))), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Couldn't load the partner program." });
    }
  },

  setRange(r) {
    set({ range: r });
    void get().loadStats(r);
  },

  async loadStats(r = get().range) {
    try {
      const s = affiliateStats(asMap(await api.get("/affiliate/stats", { days: r })));
      set((st) => ({ stats: { ...st.stats, [r]: s } }));
    } catch {}
  },

  async loadCommissions(more = false) {
    const { commissionsCursor, loadingMore } = get();
    if (more && (!commissionsCursor || loadingMore)) return;
    set({ loadingMore: more });
    try {
      const p = asMap(await api.get("/affiliate/commissions", { limit: 20, ...(more && commissionsCursor ? { cursor: commissionsCursor } : {}) }));
      const items = asList(p.items).map((x) => commission(asMap(x)));
      set((s) => ({ commissions: more ? [...s.commissions, ...items] : items, commissionsCursor: typeof p.nextCursor === "string" ? p.nextCursor : null, commissionsLoaded: true }));
    } catch {
    } finally {
      set({ loadingMore: false });
    }
  },

  async loadPayouts() {
    try {
      set({ payouts: asList(await api.get("/affiliate/payouts")).map((x) => affiliatePayout(asMap(x))) });
    } catch {}
  },

  async codeAvailable(raw) {
    const r = asMap(await api.get("/affiliate/code-available", { code: raw.trim() }));
    return { code: typeof r.code === "string" ? r.code : normaliseCode(raw), available: r.available === true, reason: typeof r.reason === "string" ? r.reason : null };
  },

  async apply(input) {
    set({ overview: affiliateOverview(asMap(await api.post("/affiliate/apply", applyBody(input)))) });
  },

  async requestPayout(payoutAccountId) {
    const p = affiliatePayout(asMap(await api.post("/affiliate/payouts", { payoutAccountId }, { "Idempotency-Key": newIdempotencyKey() })));
    set((s) => ({ payouts: [p, ...s.payouts.filter((x) => x.id !== p.id)] }));
    void get().load();
    void get().loadCommissions();
    return p;
  },

  async refreshAll() {
    await get().load();
    if (get().overview?.status !== "ACTIVE") return;
    await Promise.allSettled([get().loadStats(), get().loadCommissions(), get().loadPayouts()]);
  },

  reset: () => set({ ...EMPTY, range: 30 }),
}));

const NOTICE: Record<string, string> = {
  approved: "You're a Vibe creator partner 🎉",
  rejected: "Your partner application was declined",
  suspended: "Your partner account is paused",
  reactivated: "Your partner account is active again",
  payout_paid: "Partner payout sent 💸",
  payout_rejected: "Partner payout returned",
};

realtime.on(Ev.affiliateUpdated, (d) => {
  const msg = NOTICE[String(d.event)];
  if (msg) toast(msg, { error: d.event === "rejected" || d.event === "payout_rejected" || d.event === "suspended" });
  const s = useAffiliate.getState();
  if (s.overview) void s.refreshAll();
});
