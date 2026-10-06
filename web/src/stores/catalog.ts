import { create } from "zustand";

import { asList, asMap, type Json, num, optStr, str } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { DEFAULT_ECONOMY, DEFAULT_GIFTS, DEFAULT_PACKS, DEFAULT_PLANS, type Economy } from "@/lib/catalog";
import type { CoinPack, Gift, VipPlan } from "@/lib/models";

import { api, realtime } from "./services";

/**
 * Prices, packs, plans, gifts and rules. Starts with the built-in defaults,
 * then `GET /catalog`, reloaded when staff change something in the admin
 * panel (`catalog:updated`). Components that show prices read this store, so
 * they redraw with the new numbers.
 */
interface CatalogState {
  version: string;
  economy: Economy;
  packs: CoinPack[];
  plans: VipPlan[];
  gifts: Gift[];
  load: () => Promise<void>;
  apply: (c: Json) => void;
  gift: (id: unknown) => Gift | null;
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  version: "default",
  economy: DEFAULT_ECONOMY,
  packs: DEFAULT_PACKS,
  plans: DEFAULT_PLANS,
  gifts: DEFAULT_GIFTS,

  async load() {
    try {
      get().apply(asMap(await api.get("/catalog")));
    } catch {
      // Keep the values we have; prices are re-checked by the server anyway.
    }
  },

  /** Applies a `GET /catalog` body. Unknown or missing fields keep their value. */
  apply(c) {
    const e = asMap(c.economy);
    const prev = get().economy;
    const n = (k: string, fallback: number) => (typeof e[k] === "number" ? (e[k] as number) : fallback);
    const economy: Economy = {
      ...prev,
      genderFilterCost: n("genderFilterCost", prev.genderFilterCost),
      regionFilterCost: n("regionFilterCost", prev.regionFilterCost),
      reconnectCost: n("reconnectCost", prev.reconnectCost),
      friendRequestCost: n("friendRequestCost", prev.friendRequestCost),
      freeFriendRequestsPerDay: n("freeFriendRequestsPerDay", prev.freeFriendRequestsPerDay),
      skipCooldownBypassCost: n("skipCooldownBypassCost", prev.skipCooldownBypassCost),
      skipsBeforeCooldown: n("skipsBeforeCooldown", prev.skipsBeforeCooldown),
      skipCooldownSeconds: n("skipCooldownSeconds", prev.skipCooldownSeconds),
      boostCost: n("boostCost", prev.boostCost),
      boostMinutes: n("boostMinutes", prev.boostMinutes),
      giftGemShare: n("giftGemShare", prev.giftGemShare),
      usdPerGem: typeof e.usdCentsPerGem === "number" ? e.usdCentsPerGem / 100 : prev.usdPerGem,
      cashoutMinGems: n("cashoutMinGems", prev.cashoutMinGems),
      vipMonthlyBonusCoins: n("vipMonthlyBonusCoins", prev.vipMonthlyBonusCoins),
      checkInRewards: Array.isArray(e.checkInRewards) ? e.checkInRewards.map((x) => Math.trunc(num(x))) : prev.checkInRewards,
      rewardedAdCoins: n("rewardedAdCoins", prev.rewardedAdCoins),
      rewardedAdsPerDay: n("rewardedAdsPerDay", prev.rewardedAdsPerDay),
      inviteRewardCoins: n("inviteRewardCoins", prev.inviteRewardCoins),
      profileCompleteCoins: n("profileCompleteCoins", prev.profileCompleteCoins),
      welcomeCoins: n("welcomeCoins", prev.welcomeCoins),
      streakRestoreCost: n("streakRestoreCost", prev.streakRestoreCost),
      streakWeeklyCoins: n("streakWeeklyCoins", prev.streakWeeklyCoins),
      freeReconnectMinutes: n("freeReconnectMinutes", prev.freeReconnectMinutes),
      vibeHourStart: n("vibeHourStart", prev.vibeHourStart),
      vibeHourMinutes: n("vibeHourMinutes", prev.vibeHourMinutes),
      vibeHourGemBonusPercent: n("vibeHourGemBonusPercent", prev.vibeHourGemBonusPercent),
      xpPerGoodCall: n("xpPerGoodCall", prev.xpPerGoodCall),
      xpPerLikeReceived: n("xpPerLikeReceived", prev.xpPerLikeReceived),
      xpPerGiftReceived: n("xpPerGiftReceived", prev.xpPerGiftReceived),
      xpPerCheckIn: n("xpPerCheckIn", prev.xpPerCheckIn),
      xpPerStreakDay: n("xpPerStreakDay", prev.xpPerStreakDay),
      maxEngagementPushesPerDay: n("maxEngagementPushesPerDay", prev.maxEngagementPushesPerDay),
      inviteeRewardCoins: n("inviteeRewardCoins", prev.inviteeRewardCoins),
      referralActivationCalls: n("referralActivationCalls", prev.referralActivationCalls),
      referralRequireVerified: n("referralRequireVerified", prev.referralRequireVerified),
      referralHoldHours: n("referralHoldHours", prev.referralHoldHours),
      referralMilestone1: n("referralMilestone1", prev.referralMilestone1),
      referralMilestone1VipDays: n("referralMilestone1VipDays", prev.referralMilestone1VipDays),
      referralMilestone2: n("referralMilestone2", prev.referralMilestone2),
      referralMilestone2VipDays: n("referralMilestone2VipDays", prev.referralMilestone2VipDays),
      referralMilestone3: n("referralMilestone3", prev.referralMilestone3),
      referralMilestone3Coins: n("referralMilestone3Coins", prev.referralMilestone3Coins),
      affiliateRevSharePercent: n("affiliateRevSharePercent", prev.affiliateRevSharePercent),
      affiliateCommissionMonths: n("affiliateCommissionMonths", prev.affiliateCommissionMonths),
      affiliateCpaUsdCents: n("affiliateCpaUsdCents", prev.affiliateCpaUsdCents),
      affiliateHoldDays: n("affiliateHoldDays", prev.affiliateHoldDays),
      affiliateMinPayoutUsdCents: n("affiliateMinPayoutUsdCents", prev.affiliateMinPayoutUsdCents),
    };
    const list = (k: string) => asList(c[k]).map(asMap);
    const packs: CoinPack[] = list("packs").map((p) => ({
      id: str(p.id),
      name: str(p.name),
      coins: Math.trunc(num(p.coins)),
      usd: num(p.usdCents) / 100,
      bonusPercent: Math.trunc(num(p.bonusPercent)),
      tag: optStr(p.tag),
    }));
    const plans: VipPlan[] = list("plans").map((p) => ({
      id: str(p.id),
      label: str(p.label),
      days: Math.trunc(num(p.days)),
      usd: num(p.usdCents) / 100,
      savePercent: Math.trunc(num(p.savePercent)),
      trialDays: Math.trunc(num(p.trialDays)),
      highlighted: p.highlighted === true,
    }));
    const gifts: Gift[] = list("gifts").map((g) => ({ id: str(g.id), name: str(g.name), emoji: str(g.emoji), coins: Math.trunc(num(g.coins)) }));
    const version = String(c.version ?? "");
    // Never leave the store empty because of a bad response.
    set((s) => ({
      economy,
      packs: packs.length ? packs : s.packs,
      plans: plans.length ? plans : s.plans,
      gifts: gifts.length ? gifts : s.gifts,
      version: version || s.version,
    }));
  },

  gift(id) {
    return get().gifts.find((g) => g.id === id) ?? null;
  },
}));

/** Read the current rules outside React (stores, actions). */
export const economy = () => useCatalog.getState().economy;

realtime.on(Ev.catalogUpdated, (d) => {
  if (String(d.version) !== useCatalog.getState().version) void useCatalog.getState().load();
});
