import type { CoinPack, Country, Gift, VipPlan } from "./models";

/**
 * Prices and rules — the numbers from BUSINESS.md. These are the defaults;
 * the catalog store replaces them with `GET /catalog` (and again on
 * `catalog:updated`) so staff changes in the admin panel reach the page live.
 * The server computes every charge — these are for display.
 */
export interface Economy {
  genderFilterCost: number;
  regionFilterCost: number;
  reconnectCost: number;
  friendRequestCost: number;
  freeFriendRequestsPerDay: number;
  skipCooldownBypassCost: number;
  skipsBeforeCooldown: number;
  skipCooldownSeconds: number;
  boostCost: number;
  boostMinutes: number;
  giftGemShare: number;
  usdPerGem: number;
  cashoutMinGems: number;
  vipMonthlyBonusCoins: number;
  checkInRewards: number[];
  rewardedAdCoins: number;
  rewardedAdsPerDay: number;
  inviteRewardCoins: number;
  profileCompleteCoins: number;
  welcomeCoins: number;
  /** Restore a friend streak that broke yesterday (VIP free). */
  streakRestoreCost: number;
  /** Both friends get this every 7th streak day. */
  streakWeeklyCoins: number;
  /** Reconnect is free this long after a dropped call or a mutual like. */
  freeReconnectMinutes: number;
  /** Minutes after business midnight (UTC+5). */
  vibeHourStart: number;
  /** 0 = off. */
  vibeHourMinutes: number;
  vibeHourGemBonusPercent: number;
  xpPerGoodCall: number;
  xpPerLikeReceived: number;
  xpPerGiftReceived: number;
  xpPerCheckIn: number;
  xpPerStreakDay: number;
  maxEngagementPushesPerDay: number;
  /** Local currency shown next to USD prices. */
  pkrPerUsd: number;
}

export const DEFAULT_ECONOMY: Economy = {
  genderFilterCost: 10,
  regionFilterCost: 5,
  reconnectCost: 20,
  friendRequestCost: 10,
  freeFriendRequestsPerDay: 3,
  skipCooldownBypassCost: 5,
  skipsBeforeCooldown: 5,
  skipCooldownSeconds: 10,
  boostCost: 50,
  boostMinutes: 30,
  giftGemShare: 0.5,
  usdPerGem: 0.005,
  cashoutMinGems: 5000,
  vipMonthlyBonusCoins: 200,
  checkInRewards: [5, 10, 15, 20, 25, 30, 50],
  rewardedAdCoins: 10,
  rewardedAdsPerDay: 10,
  inviteRewardCoins: 100,
  profileCompleteCoins: 50,
  welcomeCoins: 30,
  streakRestoreCost: 30,
  streakWeeklyCoins: 10,
  freeReconnectMinutes: 10,
  vibeHourStart: 1260,
  vibeHourMinutes: 60,
  vibeHourGemBonusPercent: 0,
  xpPerGoodCall: 10,
  xpPerLikeReceived: 5,
  xpPerGiftReceived: 5,
  xpPerCheckIn: 5,
  xpPerStreakDay: 2,
  maxEngagementPushesPerDay: 3,
  pkrPerUsd: 280,
};

export const DEFAULT_PACKS: CoinPack[] = [
  { id: "starter", name: "Starter", coins: 100, usd: 0.99, bonusPercent: 0 },
  { id: "popular", name: "Popular", coins: 550, usd: 4.99, bonusPercent: 0, tag: "Most popular" },
  { id: "value", name: "Value", coins: 1200, usd: 9.99, bonusPercent: 0, tag: "Best value" },
  { id: "pro", name: "Pro", coins: 3000, usd: 24.99, bonusPercent: 10 },
  { id: "whale", name: "Big spender", coins: 6500, usd: 49.99, bonusPercent: 30 },
];

export const DEFAULT_PLANS: VipPlan[] = [
  { id: "vip_week", label: "Weekly", days: 7, usd: 2.99, savePercent: 0, trialDays: 0, highlighted: false },
  { id: "vip_month", label: "Monthly", days: 30, usd: 7.99, savePercent: 0, trialDays: 3, highlighted: true },
  { id: "vip_year", label: "Yearly", days: 365, usd: 49.99, savePercent: 48, trialDays: 0, highlighted: false },
];

export const DEFAULT_GIFTS: Gift[] = [
  { id: "rose", name: "Rose", emoji: "🌹", coins: 5 },
  { id: "heart", name: "Heart", emoji: "💖", coins: 20 },
  { id: "coffee", name: "Coffee", emoji: "☕", coins: 50 },
  { id: "fireworks", name: "Fireworks", emoji: "🎆", coins: 100 },
  { id: "crown", name: "Crown", emoji: "👑", coins: 500 },
  { id: "rocket", name: "Rocket", emoji: "🚀", coins: 1000 },
];

export const COUNTRIES: Country[] = [
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
];

export const country = (code: string | null | undefined): Country => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

export const INTERESTS = [
  "Music",
  "Gaming",
  "Travel",
  "Movies",
  "Cricket",
  "Football",
  "Anime",
  "Cooking",
  "Fitness",
  "Art",
  "Photography",
  "Books",
  "Tech",
  "Fashion",
  "Dance",
  "Languages",
  "Pets",
  "Cars",
  "Coffee",
  "Memes",
];

/** What the receiver earns for a gift (the gem share of its coin value). */
export const giftGems = (g: Gift, e: Economy) => Math.round(g.coins * e.giftGemShare);
