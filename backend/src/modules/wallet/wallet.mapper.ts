import type { LedgerEntry, Wallet } from '@prisma/client';

import { Clock } from '../../common/utils/clock';
import { EconomyRules, gemsToUsdCents } from '../catalog/economy';

type Rules = Pick<EconomyRules, 'checkInRewards' | 'rewardedAdsPerDay' | 'rewardedAdCoins' | 'freeFriendRequestsPerDay' | 'cashoutMinGems' | 'usdCentsPerGem'>;

/** What the app sees: balances plus every derived flag it needs to render. */
export interface WalletView {
  coins: number;
  gems: number;
  gemsUsdCents: number;
  canCashOut: boolean;
  vip: { active: boolean; until: string | null };
  boost: { active: boolean; until: string | null };
  checkIn: { checkedInToday: boolean; nextDay: number; streakDay: number; lastAt: string | null; rewards: readonly number[] };
  ads: { leftToday: number; perDay: number; reward: number };
  freeFriendRequestsLeft: number;
  profileBonusClaimed: boolean;
}

export function nextCheckInDay(w: Pick<Wallet, 'lastCheckInAt' | 'streakDay'>, clock: Clock, rules: Pick<Rules, 'checkInRewards'>): number {
  const len = rules.checkInRewards.length;
  if (!w.lastCheckInAt) return 0;
  if (clock.sameDay(w.lastCheckInAt) || clock.isYesterday(w.lastCheckInAt)) return w.streakDay % len;
  return 0; // missed a day: the streak starts over
}

export function adsLeftToday(w: Pick<Wallet, 'adsDay' | 'adsWatchedToday'>, clock: Clock, rules: Pick<Rules, 'rewardedAdsPerDay'>): number {
  if (!clock.isToday(w.adsDay)) return rules.rewardedAdsPerDay;
  return Math.max(0, rules.rewardedAdsPerDay - w.adsWatchedToday);
}

export function freeFriendRequestsLeft(w: Pick<Wallet, 'friendRequestsDay' | 'freeFriendRequestsToday'>, clock: Clock, rules: Pick<Rules, 'freeFriendRequestsPerDay'>): number {
  if (!clock.isToday(w.friendRequestsDay)) return rules.freeFriendRequestsPerDay;
  return Math.max(0, rules.freeFriendRequestsPerDay - w.freeFriendRequestsToday);
}

export const isVip = (w: Pick<Wallet, 'vipUntil'> | null | undefined, now: Date): boolean => !!w?.vipUntil && w.vipUntil > now;
export const isBoosted = (w: Pick<Wallet, 'boostUntil'> | null | undefined, now: Date): boolean => !!w?.boostUntil && w.boostUntil > now;

export function toWalletView(w: Wallet, clock: Clock, rules: Rules): WalletView {
  const now = clock.now();
  return {
    coins: w.coins,
    gems: w.gems,
    gemsUsdCents: gemsToUsdCents(w.gems, rules),
    canCashOut: w.gems >= rules.cashoutMinGems,
    vip: { active: isVip(w, now), until: w.vipUntil?.toISOString() ?? null },
    boost: { active: isBoosted(w, now), until: w.boostUntil?.toISOString() ?? null },
    checkIn: {
      checkedInToday: clock.sameDay(w.lastCheckInAt),
      nextDay: nextCheckInDay(w, clock, rules),
      streakDay: w.streakDay,
      lastAt: w.lastCheckInAt?.toISOString() ?? null,
      rewards: rules.checkInRewards,
    },
    ads: { leftToday: adsLeftToday(w, clock, rules), perDay: rules.rewardedAdsPerDay, reward: rules.rewardedAdCoins },
    freeFriendRequestsLeft: freeFriendRequestsLeft(w, clock, rules),
    profileBonusClaimed: w.profileBonusClaimed,
  };
}

/** Ledger row → the app's Transaction shape. */
export function toTransactionView(e: LedgerEntry) {
  const kind = {
    PURCHASE: 'purchase',
    SPEND: 'spend',
    EARN: 'earn',
    GIFT_SENT: 'gift',
    GIFT_RECEIVED: 'gift',
    CASHOUT: 'cashout',
    CASHOUT_REVERSAL: 'cashout',
    VIP: 'vip',
    REFUND: 'earn',
    ADJUSTMENT: 'earn',
  }[e.kind];
  return {
    id: e.id,
    kind,
    ledgerKind: e.kind,
    title: e.title,
    coins: e.coins,
    gems: e.gems,
    usd: e.usdCents / 100,
    method: e.method,
    receipt: e.reference,
    at: e.createdAt.toISOString(),
  };
}
