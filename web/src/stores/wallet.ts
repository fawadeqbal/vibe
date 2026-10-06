import { create } from "zustand";

import { newIdempotencyKey } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { asList, asMap, type Json, paymentMethodFromApi, paymentMethodToApi, transaction, wallet as mapWallet } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { MatchFilters, PaymentMethod, Transaction, Wallet } from "@/lib/models";
import {
  type Cashout,
  cashoutStatusFromApi,
  type NewPayoutAccount,
  parseCashout,
  parsePaymentOptions,
  parsePayoutAccount,
  parsePurchase,
  parseVipStatus,
  type PaymentOptions,
  type PayoutAccount,
  type PurchaseRequest,
  purchaseRequestJson,
  type PurchaseView,
  type VipStatus,
} from "@/lib/payments";
import { normaliseAccount } from "@/lib/pk-validation";

import { economy } from "./catalog";
import { api, realtime } from "./services";
import { useSession } from "./session";
import { toast } from "./ui";

/**
 * Coins, gems, VIP, boosts, the ledger, checkout and cash-outs. The Vibe API
 * is the source of truth: every action is a server call and balances arrive
 * live over the socket (mirror of the Flutter `RemoteWalletProvider`).
 */
interface WalletState {
  wallet: Wallet;
  /** The raw server view: it carries the day-bound counters (check-in, ads…). */
  view: Json;
  transactions: Transaction[];
  loaded: boolean;
  payoutAccounts: PayoutAccount[];
  payoutMethods: PaymentMethod[];
  cashouts: Cashout[];
  payoutsLoaded: boolean;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Today's check-in. Null when already claimed today. */
  checkIn: () => Promise<number | null>;
  claimProfileBonus: () => Promise<number | null>;
  /** Pays for a watched rewarded ad (null: today's ads are used up). */
  rewardAd: (adToken: string) => Promise<number | null>;
  /** False when there aren't enough coins. Uses a free boost credit first. */
  boost: () => Promise<boolean>;
  /** Gems to save towards (100…10,000,000), or null to clear. False when it could not be saved. */
  setGemGoal: (goal: number | null) => Promise<boolean>;
  vipStatus: () => Promise<VipStatus>;
  /** Stops renewal. Store subscriptions reject (409) with `details.manageUrl`. */
  cancelVip: () => Promise<void>;

  paymentOptions: () => Promise<PaymentOptions>;
  createPurchase: (r: PurchaseRequest, idempotencyKey: string) => Promise<PurchaseView>;
  purchase: (id: string) => Promise<PurchaseView>;
  confirmPurchase: (id: string, otp: string) => Promise<PurchaseView>;
  checkPurchase: (id: string) => Promise<PurchaseView>;
  cancelPurchase: (id: string) => Promise<PurchaseView>;
  sendBankReference: (id: string, reference: string) => Promise<PurchaseView>;

  loadPayouts: () => Promise<void>;
  addPayoutAccount: (a: NewPayoutAccount) => Promise<PayoutAccount>;
  makeDefaultPayoutAccount: (id: string) => Promise<void>;
  removePayoutAccount: (id: string) => Promise<void>;
  requestCashout: (input: { gems?: number; payoutAccountId: string }) => Promise<Cashout>;
  reset: () => void;
}

const EMPTY_WALLET: Wallet = { coins: 0, gems: 0, vipUntil: null, boostUntil: null, streakDay: 0, lastCheckIn: null, profileBonusClaimed: false, gemGoal: null, freeBoosts: 0 };
/** How long to wait before re-claiming an ad whose server-side callback has not landed yet (the app's adRetryDelay). */
const AD_RETRY_MS = 2000;

/** Purchases that changed outside a request (wallet approved, card paid, expired…). */
const purchaseListeners = new Set<(p: PurchaseView) => void>();
export function onPurchaseUpdate(fn: (p: PurchaseView) => void) {
  purchaseListeners.add(fn);
  return () => void purchaseListeners.delete(fn);
}

let ledgerDebounce: ReturnType<typeof setTimeout> | undefined;

export const useWallet = create<WalletState>()((set, get) => {
  const applyView = (w: Json, refreshLedger = false) => {
    set({ view: w, wallet: mapWallet(w) });
    if (refreshLedger) {
      clearTimeout(ledgerDebounce);
      ledgerDebounce = setTimeout(() => void get().refresh(), 600);
    }
  };
  const applyResult = (res: unknown) => {
    const r = asMap(res);
    if (r.wallet && typeof r.wallet === "object") applyView(r.wallet as Json, true);
  };
  /** Every purchase answer carries the new wallet once it succeeded. */
  const purchaseCall = async (call: () => Promise<unknown>) => {
    const p = parsePurchase(asMap(await call()));
    if (p.wallet) applyView(p.wallet, true);
    return p;
  };
  const claim = async (path: string, body?: Json, nullOn = ["ALREADY_CLAIMED", "DAILY_LIMIT_REACHED"]) => {
    try {
      const res = asMap(await api.post(path, body, { "Idempotency-Key": newIdempotencyKey() }));
      applyResult(res);
      return typeof res.reward === "number" ? res.reward : 0;
    } catch (e) {
      if (e instanceof ApiError && nullOn.includes(e.code)) return null;
      throw e;
    }
  };
  const reloadAccounts = async () => {
    const res = asMap(await api.get("/wallet/payout-accounts"));
    set({ payoutAccounts: asList(res.accounts).map((a) => parsePayoutAccount(asMap(a))) });
  };

  return {
    wallet: EMPTY_WALLET,
    view: {},
    transactions: [],
    loaded: false,
    payoutAccounts: [],
    payoutMethods: ["jazzCash", "easypaisa", "bank"],
    cashouts: [],
    payoutsLoaded: false,

    async load() {
      if (!api.hasSession) return;
      applyView(asMap(await api.get("/wallet")));
      await get().refresh();
      set({ loaded: true });
    },

    async refresh() {
      try {
        const page = asMap(await api.get("/wallet/transactions", { limit: 50 }));
        // Newest first, as the API sends it.
        set({ transactions: asList(page.items).map((e) => transaction(asMap(e))) });
      } catch {}
    },

    checkIn: () => claim("/wallet/check-in"),
    claimProfileBonus: () => claim("/wallet/rewards/profile", undefined, ["ALREADY_CLAIMED", "PROFILE_INCOMPLETE"]),

    async rewardAd(adToken) {
      // The token is the nonce AdMob echoes to the server in its signed callback,
      // which can land a moment after the ad closes: retry once on AD_NOT_VERIFIED.
      try {
        return await claim("/wallet/rewards/ad", { adToken });
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== "AD_NOT_VERIFIED") throw e;
        await new Promise((r) => setTimeout(r, AD_RETRY_MS));
        return claim("/wallet/rewards/ad", { adToken });
      }
    },

    async boost() {
      try {
        applyResult(await api.post("/wallet/boost", undefined, { "Idempotency-Key": newIdempotencyKey() }));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return false;
        throw e;
      }
    },

    async setGemGoal(goal) {
      if (!(await useSession.getState().savePrefs({ gemGoal: goal }))) return false;
      set((s) => ({ wallet: { ...s.wallet, gemGoal: goal }, view: { ...s.view, gemGoal: goal } }));
      return true;
    },

    vipStatus: async () => parseVipStatus(asMap(await api.get("/vip"))),

    async cancelVip() {
      await api.post("/vip/cancel");
      applyView(asMap(await api.get("/wallet")), true);
    },

    paymentOptions: async () => parsePaymentOptions(asMap(await api.get("/payments/methods")), economy().pkrPerUsd),
    createPurchase: (r, key) => purchaseCall(() => api.post("/payments/purchases", purchaseRequestJson(r), { "Idempotency-Key": key })),
    purchase: (id) => purchaseCall(() => api.get(`/payments/purchases/${id}`)),
    confirmPurchase: (id, otp) => purchaseCall(() => api.post(`/payments/purchases/${id}/confirm`, { otp })),
    checkPurchase: (id) => purchaseCall(() => api.post(`/payments/purchases/${id}/check`)),
    cancelPurchase: (id) => purchaseCall(() => api.post(`/payments/purchases/${id}/cancel`)),
    sendBankReference: (id, reference) => purchaseCall(() => api.post(`/payments/purchases/${id}/bank-reference`, { reference: reference.trim() })),

    async loadPayouts() {
      const [accounts, cashouts] = await Promise.all([api.get("/wallet/payout-accounts"), api.get("/wallet/cashouts")]);
      const a = asMap(accounts);
      set({
        payoutAccounts: asList(a.accounts).map((x) => parsePayoutAccount(asMap(x))),
        payoutMethods: asList(a.methods)
          .map(paymentMethodFromApi)
          .filter((m): m is PaymentMethod => m != null),
        cashouts: asList(cashouts).map((c) => parseCashout(asMap(c))),
        payoutsLoaded: true,
      });
    },

    async addPayoutAccount(input) {
      const body = {
        method: paymentMethodToApi(input.method),
        account: normaliseAccount(input.method, input.account),
        holderName: input.holderName.trim(),
        ...(input.bankName?.trim() ? { bankName: input.bankName.trim() } : {}),
        ...(input.makeDefault ? { makeDefault: true } : {}),
      };
      const a = parsePayoutAccount(asMap(await api.post("/wallet/payout-accounts", body)));
      await reloadAccounts();
      return a;
    },

    async makeDefaultPayoutAccount(id) {
      const list = asList(await api.post(`/wallet/payout-accounts/${id}/default`));
      set({ payoutAccounts: list.map((a) => parsePayoutAccount(asMap(a))) });
    },

    async removePayoutAccount(id) {
      await api.delete(`/wallet/payout-accounts/${id}`);
      await reloadAccounts();
    },

    async requestCashout({ gems, payoutAccountId }) {
      const res = asMap(await api.post("/wallet/cashouts", { ...(gems != null ? { gems } : {}), payoutAccountId }, { "Idempotency-Key": newIdempotencyKey() }));
      applyResult(res);
      const c = parseCashout(asMap(res.cashout));
      set((s) => ({ cashouts: [c, ...s.cashouts.filter((x) => x.id !== c.id)] }));
      return c;
    },

    reset: () => set({ wallet: EMPTY_WALLET, view: {}, transactions: [], loaded: false, payoutAccounts: [], cashouts: [], payoutsLoaded: false }),
  };
});

// ── derived values (the server computes the day-bound ones in its timezone) ──

export const isVip = (w: Wallet, now = Date.now()) => !!w.vipUntil && w.vipUntil.getTime() > now;
export const isBoosted = (w: Wallet, now = Date.now()) => !!w.boostUntil && w.boostUntil.getTime() > now;

const checkIn = (s: Pick<WalletState, "view">) => asMap(s.view.checkIn);
export const checkedInToday = (s: Pick<WalletState, "view">) => checkIn(s).checkedInToday === true;
export const nextCheckInDay = (s: Pick<WalletState, "view">) => (typeof checkIn(s).nextDay === "number" ? (checkIn(s).nextDay as number) : 0);
const ads = (s: Pick<WalletState, "view">) => asMap(s.view.ads);
export const adsLeftToday = (s: Pick<WalletState, "view">) => (typeof ads(s).leftToday === "number" ? (ads(s).leftToday as number) : economy().rewardedAdsPerDay);
export const freeFriendRequestsLeft = (s: Pick<WalletState, "view">) =>
  typeof s.view.freeFriendRequestsLeft === "number" ? s.view.freeFriendRequestsLeft : economy().freeFriendRequestsPerDay;
export const canCashOut = (s: Pick<WalletState, "view" | "wallet">) =>
  typeof s.view.canCashOut === "boolean" ? s.view.canCashOut : s.wallet.gems >= economy().cashoutMinGems;

/** Coins a single match costs with these filters (0 for VIP and during Vibe Hour: pass `free`). */
export function filterCost(f: MatchFilters, free: boolean): number {
  if (free) return 0;
  const e = economy();
  return (f.gender !== "anyone" ? e.genderFilterCost : 0) + (f.countryCode ? e.regionFilterCost : 0);
}

realtime.on(Ev.walletUpdated, (w) => {
  const s = useWallet.getState();
  useWallet.setState({ view: w, wallet: mapWallet(w) });
  clearTimeout(ledgerDebounce);
  ledgerDebounce = setTimeout(() => void s.refresh(), 600);
});

realtime.on(Ev.goalReached, (d) => {
  const goal = typeof d.goal === "number" ? d.goal : useWallet.getState().wallet.gemGoal;
  toast(goal ? `Goal reached 🎯 ${goal.toLocaleString("en-US")} gems` : "Goal reached 🎯");
});

realtime.on(Ev.paymentUpdated, (m) => {
  // The socket payload has no wallet; `wallet:updated` follows on success.
  const p = parsePurchase(m);
  purchaseListeners.forEach((fn) => fn(p));
});

realtime.on(Ev.cashoutUpdated, (m) => {
  const id = String(m.id);
  const s = useWallet.getState();
  const i = s.cashouts.findIndex((c) => c.id === id);
  if (i < 0) {
    if (s.payoutsLoaded) void s.loadPayouts().catch(() => {});
    return;
  }
  const next = [...s.cashouts];
  next[i] = { ...next[i], status: cashoutStatusFromApi(m.status), failureReason: typeof m.failureReason === "string" ? m.failureReason : next[i].failureReason };
  useWallet.setState({ cashouts: next });
});
