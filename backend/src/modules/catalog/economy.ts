import { z } from 'zod';

/**
 * Prices and rules: the shapes, their validation, and the defaults (the
 * numbers from BUSINESS.md). Staff can change any of them at runtime from
 * the admin panel's Economy page; `EconomyService` serves the live values.
 * The server is authoritative: the app displays the catalog it fetches,
 * but charges and rewards are always computed here.
 */

// ── rules ────────────────────────────────────────────────────────────────────

export interface EconomyRules {
  genderFilterCost: number;
  regionFilterCost: number;
  reconnectCost: number;
  skipCooldownBypassCost: number;
  skipsBeforeCooldown: number;
  skipWindowSeconds: number;
  quickSkipSeconds: number;
  skipCooldownSeconds: number;

  friendRequestCost: number;
  freeFriendRequestsPerDay: number;
  maxFollowsPerDay: number;
  boostCost: number;
  boostMinutes: number;

  welcomeCoins: number;
  profileCompleteCoins: number;
  rewardedAdCoins: number;
  rewardedAdsPerDay: number;
  checkInRewards: number[];

  giftGemShare: number;
  usdCentsPerGem: number;
  cashoutMinGems: number;
  kycThresholdUsdCentsPerMonth: number;

  vipMonthlyBonusCoins: number;

  /** Discover (the swipe deck). 1 = on. */
  discoverEnabled: number;
  discoverFreeLikesPerDay: number;
  /** Extra likes for coins once the free ones run out. */
  discoverLikePackSize: number;
  discoverLikePackCost: number;
  discoverSuperLikeCost: number;
  discoverVipFreeSuperLikes: number;
  discoverUndoCost: number;
  /** Anti-spam ceiling, paid or not (VIP too). */
  discoverMaxLikesPerHour: number;
  /** People seen longer ago than this are left out of decks. */
  discoverActiveDays: number;
  /** A passed person can come back after this many days. */
  discoverPassResetDays: number;
  /** 1 = only selfie-verified people appear. */
  discoverVerifiedOnly: number;
  /** 1: gender, country, online-now and verified filters need VIP, Vibe Hour or a filter pass. 0: all free. */
  discoverPremiumFilters: number;
  discoverFilterPassCost: number;
  discoverFilterPassHours: number;

  /** Video calls between friends, from a chat. 1 = on. */
  friendCallsEnabled: number;
  /** 1 = both must have written in the chat before either can ask to allow calls. */
  callNeedsMessagesFirst: number;
  callRingSeconds: number;
  /** "Allow video calls?" asks per person per day. */
  callAsksPerDay: number;
  /** After "Not now" or calls turned off, the other person waits this long to ask again. */
  callAskCooldownHours: number;
  /** 0 = no limit. */
  callMaxMinutes: number;
  /** Declines in a row before that caller can't ring the person for 24 h (0 = never). */
  callDeclinePause: number;

  streakRestoreCost: number;
  streakWeeklyCoins: number;
  freeReconnectMinutes: number;
  /** Minutes after business midnight (0–1439). */
  vibeHourStart: number;
  /** 0 turns Vibe Hour off. */
  vibeHourMinutes: number;
  vibeHourGemBonusPercent: number;
  xpPerGoodCall: number;
  xpPerLikeReceived: number;
  xpPerGiftReceived: number;
  xpPerCheckIn: number;
  xpPerStreakDay: number;
  maxEngagementPushesPerDay: number;

  /** Referrals (user invites): coins to the inviter / the new user when the invitee becomes active. */
  inviteRewardCoins: number;
  inviteeRewardCoins: number;
  /** Calls of 60 s or more the invitee needs. */
  referralActivationCalls: number;
  /** 1 = the invitee must pass selfie verification. */
  referralRequireVerified: number;
  /** Wait after qualifying before paying (refund/ban window). */
  referralHoldHours: number;
  /** Rewarded referrals per inviter per business day (the rest wait for tomorrow). */
  maxReferralRewardsPerDay: number;
  referralMilestone1: number;
  referralMilestone1VipDays: number;
  referralMilestone2: number;
  referralMilestone2VipDays: number;
  referralMilestone3: number;
  referralMilestone3Coins: number;

  /** Affiliates (creator partners). */
  affiliateRevSharePercent: number;
  affiliateCommissionMonths: number;
  affiliateCpaUsdCents: number;
  affiliateStoreFeePercent: number;
  affiliateHoldDays: number;
  affiliateMinPayoutUsdCents: number;

  /**
   * Fees we pay on each sale, as a fraction of it (0.15 = 15%). Only used to
   * work out net revenue and profit for staff — nobody is charged these.
   */
  storeFeeShare: number;
  walletFeeShare: number;
  cardFeeShare: number;
  bankFeeShare: number;

  minAge: number;
  autoBanReports: number;
  autoBanWindowHours: number;
  autoBanHours: number;
}

export type RuleKey = keyof EconomyRules;
/**
 * `clock`: a time of day as whole minutes after midnight (0–1439); the admin panel shows HH:MM.
 * `days`: whole days. `flag`: 0 = off, 1 = on (the admin panel shows a switch).
 */
type RuleKind = 'coins' | 'count' | 'seconds' | 'minutes' | 'hours' | 'days' | 'gems' | 'cents' | 'share' | 'age' | 'days7' | 'clock' | 'flag';

export interface RuleField {
  key: RuleKey;
  label: string;
  help?: string;
  kind: RuleKind;
  min: number;
  max: number;
  /** `cents` only: whole cents (no fractions of a cent). */
  whole?: boolean;
}

export interface RuleGroup {
  key: string;
  label: string;
  description: string;
  fields: RuleField[];
}

const coins = (key: RuleKey, label: string, help?: string, max = 100_000): RuleField => ({ key, label, help, kind: 'coins', min: 0, max });
const count = (key: RuleKey, label: string, min: number, max: number, help?: string): RuleField => ({ key, label, help, kind: 'count', min, max });
const days = (key: RuleKey, label: string, min: number, max: number, help?: string): RuleField => ({ key, label, help, kind: 'days', min, max });
const usdCents = (key: RuleKey, label: string, max: number, help?: string): RuleField => ({ key, label, help, kind: 'cents', min: 0, max, whole: true });

/**
 * The rules, grouped the way the admin panel shows them (one card with its
 * own pencil per group). Labels, units and limits live here so validation
 * and the editor can never disagree.
 */
export const RULE_GROUPS: RuleGroup[] = [
  {
    key: 'matching',
    label: 'Matching',
    description: 'What filters and second chances cost. VIP members pay nothing for filters.',
    fields: [
      coins('genderFilterCost', 'Gender filter, per match'),
      coins('regionFilterCost', 'Country filter, per match'),
      coins('reconnectCost', 'Reconnect with the last person'),
      coins('skipCooldownBypassCost', 'Skip the cool-down'),
      count('skipsBeforeCooldown', 'Quick skips before a cool-down', 1, 100),
      { key: 'skipWindowSeconds', label: 'Counted within', kind: 'seconds', min: 10, max: 3600 },
      { key: 'quickSkipSeconds', label: 'A skip is "quick" under', kind: 'seconds', min: 1, max: 600 },
      { key: 'skipCooldownSeconds', label: 'Cool-down length', kind: 'seconds', min: 1, max: 3600 },
    ],
  },
  {
    key: 'social',
    label: 'Friends, follows and boosts',
    description: 'Friend requests after the free ones, the daily follow limit, and paid priority in the queue.',
    fields: [
      coins('friendRequestCost', 'Friend request (after the free ones)'),
      count('freeFriendRequestsPerDay', 'Free friend requests per day', 0, 100),
      count('maxFollowsPerDay', 'Follows per day', 1, 10_000, 'Stops spam-following. Unfollowing does not give follows back.'),
      coins('boostCost', 'Boost'),
      { key: 'boostMinutes', label: 'Boost length', kind: 'minutes', min: 1, max: 1440 },
    ],
  },
  {
    key: 'rewards',
    label: 'Free coins',
    description: 'Everything that gives coins away. Changes apply from the next reward.',
    fields: [
      coins('welcomeCoins', 'Welcome coins', 'Given once, at sign-up.', 10_000),
      coins('profileCompleteCoins', 'Complete-profile bonus', undefined, 10_000),
      coins('rewardedAdCoins', 'Coins per rewarded ad', undefined, 1_000),
      count('rewardedAdsPerDay', 'Rewarded ads per day', 0, 100),
      { key: 'checkInRewards', label: 'Daily check-in, day 1 → 7', help: 'Seven rewards; the streak starts over after day 7 or a missed day.', kind: 'days7', min: 0, max: 10_000 },
    ],
  },
  {
    key: 'gems',
    label: 'Gifts, gems and cash-outs',
    description: 'How much of a gift becomes gems for the receiver, and what gems are worth.',
    fields: [
      { key: 'giftGemShare', label: 'Share of a gift the receiver keeps', help: 'As gems, rounded.', kind: 'share', min: 0, max: 1 },
      { key: 'usdCentsPerGem', label: 'Value of one gem', help: 'What one gem pays out in a cash-out.', kind: 'cents', min: 0.01, max: 100 },
      { key: 'cashoutMinGems', label: 'Minimum cash-out', kind: 'gems', min: 1, max: 10_000_000 },
      { key: 'kycThresholdUsdCentsPerMonth', label: 'ID check above, per month', help: 'People cashing out more than this in a month are asked for ID.', kind: 'cents', min: 0, max: 100_000_000 },
    ],
  },
  {
    key: 'discover',
    label: 'Discover',
    description: 'The swipe deck of real people. Likes are free up to a daily limit; VIP members like without limit, get free Super Likes, free Undo and every filter. Free likes reset at midnight, Pakistan time.',
    fields: [
      { key: 'discoverEnabled', label: 'Discover is on', help: 'Off hides the Discover tab for everyone. Matches and chats stay.', kind: 'flag', min: 0, max: 1 },
      count('discoverFreeLikesPerDay', 'Free likes per day', 0, 1000, 'VIP: unlimited. Passing is always free.'),
      count('discoverLikePackSize', 'More likes: how many', 1, 1000, 'Offered when the free likes run out.'),
      coins('discoverLikePackCost', 'More likes: price'),
      coins('discoverSuperLikeCost', 'Super Like', 'They are told, and you appear first in their deck.'),
      count('discoverVipFreeSuperLikes', 'Free Super Likes per day for VIP', 0, 100),
      coins('discoverUndoCost', 'Undo a pass', 'VIP members undo for free.'),
      count('discoverMaxLikesPerHour', 'Likes per hour, at most', 1, 10_000, 'Stops bots and spam swiping, paid or not.'),
      days('discoverActiveDays', 'Hide people inactive for', 1, 365, 'Keeps decks full of people who might reply.'),
      days('discoverPassResetDays', 'Passed people come back after', 1, 365),
      { key: 'discoverVerifiedOnly', label: 'Verified people only', help: 'Show only selfie-verified people in decks.', kind: 'flag', min: 0, max: 1 },
      { key: 'discoverPremiumFilters', label: 'Extra filters need VIP or a pass', help: 'Gender, country, online now and verified only. Age is always free. VIP and Vibe Hour get them free. Off = all filters free.', kind: 'flag', min: 0, max: 1 },
      coins('discoverFilterPassCost', 'Filter pass', 'Unlocks the extra filters for non-VIP people.'),
      { key: 'discoverFilterPassHours', label: 'Filter pass lasts', kind: 'hours', min: 1, max: 720 },
    ],
  },
  {
    key: 'calls',
    label: 'Video calls in chat',
    description: 'Friends can video call from a chat, but only after both allow it. Either can turn calls off at any time, for both. Calls are never recorded.',
    fields: [
      { key: 'friendCallsEnabled', label: 'Video calls in chat are on', help: 'Off hides calling in every chat. What people allowed is kept.', kind: 'flag', min: 0, max: 1 },
      { key: 'callNeedsMessagesFirst', label: 'Both must have written first', help: 'Stops asks from people who never said hi.', kind: 'flag', min: 0, max: 1 },
      { key: 'callRingSeconds', label: 'Ring for', kind: 'seconds', min: 10, max: 120 },
      count('callAsksPerDay', '"Allow video calls?" asks per day', 1, 100, 'Across all chats.'),
      { key: 'callAskCooldownHours', label: 'Wait before asking the same person again', help: 'After "Not now", or after calls were turned off.', kind: 'hours', min: 0, max: 720 },
      { key: 'callMaxMinutes', label: 'Longest call', help: '0 = no limit.', kind: 'minutes', min: 0, max: 600 },
      count('callDeclinePause', 'Declines in a row before calls pause for a day', 0, 20, '0 = never pause.'),
    ],
  },
  {
    key: 'vip',
    label: 'VIP perks',
    description: 'Coins VIP members get each month they are subscribed. VIP also gets unlimited Discover likes, free Undo, free Super Likes and all Discover filters (set under Discover), free match filters and priority in the queue. Plans and prices are under VIP plans.',
    fields: [coins('vipMonthlyBonusCoins', 'Monthly VIP coins', undefined, 100_000)],
  },
  {
    key: 'engagement',
    label: 'Streaks, levels and Vibe Hour',
    description: 'Friend streaks, XP for levels and the weekly leaderboard, the daily Vibe Hour (free filters, double XP) and how many reminders people get.',
    fields: [
      coins('streakRestoreCost', 'Restore a lost friend streak', 'Only the day after it broke. VIP members restore for free.', 10_000),
      coins('streakWeeklyCoins', 'Streak reward every 7th day', 'Both friends get it.', 10_000),
      { key: 'freeReconnectMinutes', label: 'Free reconnect window', help: 'After a dropped call or a mutual like. 0 = never free.', kind: 'minutes', min: 0, max: 120 },
      { key: 'vibeHourStart', label: 'Vibe Hour starts at', help: 'Business time (Pakistan).', kind: 'clock', min: 0, max: 1439 },
      { key: 'vibeHourMinutes', label: 'Vibe Hour length', help: '0 turns Vibe Hour off.', kind: 'minutes', min: 0, max: 600 },
      count('vibeHourGemBonusPercent', 'Extra gems on gifts during Vibe Hour, %', 0, 200, 'Paid by the house, on top of the normal share.'),
      count('xpPerGoodCall', 'XP per call of a minute or more', 0, 1000),
      count('xpPerLikeReceived', 'XP per like received', 0, 1000),
      count('xpPerGiftReceived', 'XP per gift received', 0, 1000),
      count('xpPerCheckIn', 'XP per daily check-in', 0, 1000),
      count('xpPerStreakDay', 'XP per streak day', 0, 1000, 'Each friend, each day the streak grows.'),
      count('maxEngagementPushesPerDay', 'Reminder pushes per person per day', 0, 20, 'Streak, Vibe Hour, win-back and weekly recap pushes. Messages and payments are never capped.'),
    ],
  },
  {
    key: 'referrals',
    label: 'Invites and referrals',
    description: 'Friends inviting friends. Both get coins once the new person is active (verified and a few real calls), after a short hold. Milestones reward people who invite a lot.',
    fields: [
      coins('inviteRewardCoins', 'Invite reward (inviter)', 'To the person who shared the link, when their friend becomes active.', 10_000),
      coins('inviteeRewardCoins', 'Welcome reward (new user)', 'To the friend who joined with the link, at the same time.', 10_000),
      count('referralActivationCalls', 'Calls of a minute or more to become active', 0, 20),
      { key: 'referralRequireVerified', label: 'New user must pass selfie verification', kind: 'flag', min: 0, max: 1 },
      { key: 'referralHoldHours', label: 'Hold before paying', help: 'Time to catch fake accounts before coins go out.', kind: 'hours', min: 0, max: 720 },
      count('maxReferralRewardsPerDay', 'Rewards per inviter per day', 1, 1000, 'More wait for the next day.'),
      count('referralMilestone1', 'Milestone 1: active friends', 1, 1000),
      days('referralMilestone1VipDays', 'Milestone 1: VIP', 0, 365),
      count('referralMilestone2', 'Milestone 2: active friends', 1, 1000),
      days('referralMilestone2VipDays', 'Milestone 2: VIP', 0, 365),
      count('referralMilestone3', 'Milestone 3: active friends', 1, 1000),
      coins('referralMilestone3Coins', 'Milestone 3: coins', undefined, 100_000),
    ],
  },
  {
    key: 'affiliates',
    label: 'Creator partners',
    description: 'What creators (affiliates) earn on the people they bring: a share of their purchases for a number of months, plus a fixed amount per active user. Per-partner terms override the share and the fixed amount.',
    fields: [
      count('affiliateRevSharePercent', 'Share of purchases, %', 0, 80),
      count('affiliateCommissionMonths', 'Months after sign-up that earn', 1, 36),
      usdCents('affiliateCpaUsdCents', 'Per active user', 10_000),
      count('affiliateStoreFeePercent', 'Store fee taken off first, %', 0, 50, 'Google Play and App Store purchases only.'),
      days('affiliateHoldDays', 'Hold before earnings are available', 0, 90, 'Covers refunds.'),
      usdCents('affiliateMinPayoutUsdCents', 'Minimum payout', 1_000_000),
    ],
  },
  {
    key: 'fees',
    label: 'Fees we pay',
    description: 'What the app stores and payment companies keep from each sale. Only used to work out net revenue and profit on the Revenue page; nobody is charged these. Set them to the rates in your agreements.',
    fields: [
      { key: 'storeFeeShare', label: 'Google Play and App Store', help: '15% up to $1M a year in sales, 30% above that.', kind: 'share', min: 0, max: 0.5 },
      { key: 'walletFeeShare', label: 'JazzCash and Easypaisa', kind: 'share', min: 0, max: 0.2 },
      { key: 'cardFeeShare', label: 'Cards', kind: 'share', min: 0, max: 0.2 },
      { key: 'bankFeeShare', label: 'Bank transfer', kind: 'share', min: 0, max: 0.2 },
    ],
  },
  {
    key: 'safety',
    label: 'Safety',
    description: 'Age limit and automatic bans. One under-age report always bans.',
    fields: [
      { key: 'minAge', label: 'Minimum age', help: 'Never below 18.', kind: 'age', min: 18, max: 99 },
      count('autoBanReports', 'Reports from different people that auto-ban', 1, 100),
      { key: 'autoBanWindowHours', label: 'Counted within', kind: 'hours', min: 1, max: 720 },
      { key: 'autoBanHours', label: 'Auto-ban length', kind: 'hours', min: 1, max: 8760 },
    ],
  },
];

export const RULE_FIELDS: RuleField[] = RULE_GROUPS.flatMap((g) => g.fields);

/** Staff-only numbers, left out of the public catalog the apps download. */
export const PRIVATE_RULES: readonly RuleKey[] = ['storeFeeShare', 'walletFeeShare', 'cardFeeShare', 'bankFeeShare'];

export const publicRules = (r: EconomyRules): Partial<EconomyRules> => Object.fromEntries(Object.entries(r).filter(([k]) => !PRIVATE_RULES.includes(k as RuleKey))) as Partial<EconomyRules>;

/** The share of a sale the store or payment company keeps, by payment method. */
export function feeShareFor(method: string, r: Pick<EconomyRules, 'storeFeeShare' | 'walletFeeShare' | 'cardFeeShare' | 'bankFeeShare'>): number {
  switch (method) {
    case 'GOOGLE_PLAY':
    case 'APP_STORE':
      return r.storeFeeShare;
    case 'JAZZCASH':
    case 'EASYPAISA':
      return r.walletFeeShare;
    case 'CARD':
      return r.cardFeeShare;
    case 'BANK':
      return r.bankFeeShare;
    default:
      return 0;
  }
}

export const DEFAULT_RULES: EconomyRules = {
  genderFilterCost: 10,
  regionFilterCost: 5,
  reconnectCost: 20,
  skipCooldownBypassCost: 5,
  skipsBeforeCooldown: 5,
  skipWindowSeconds: 60,
  quickSkipSeconds: 10,
  skipCooldownSeconds: 10,

  friendRequestCost: 10,
  freeFriendRequestsPerDay: 3,
  maxFollowsPerDay: 200,
  boostCost: 50,
  boostMinutes: 30,

  welcomeCoins: 30,
  profileCompleteCoins: 50,
  rewardedAdCoins: 10,
  rewardedAdsPerDay: 10,
  checkInRewards: [5, 10, 15, 20, 25, 30, 50],

  giftGemShare: 0.5,
  usdCentsPerGem: 0.5, // 1 gem = $0.005
  cashoutMinGems: 5000,
  kycThresholdUsdCentsPerMonth: 10_000,

  vipMonthlyBonusCoins: 200,

  discoverEnabled: 1,
  discoverFreeLikesPerDay: 30,
  discoverLikePackSize: 30,
  discoverLikePackCost: 20,
  discoverSuperLikeCost: 10,
  discoverVipFreeSuperLikes: 1,
  discoverUndoCost: 5,
  discoverMaxLikesPerHour: 120,
  discoverActiveDays: 14,
  discoverPassResetDays: 30,
  discoverVerifiedOnly: 0,
  discoverPremiumFilters: 1,
  discoverFilterPassCost: 25,
  discoverFilterPassHours: 24,

  friendCallsEnabled: 1,
  callNeedsMessagesFirst: 1,
  callRingSeconds: 30,
  callAsksPerDay: 10,
  callAskCooldownHours: 24,
  callMaxMinutes: 60,
  callDeclinePause: 3,

  streakRestoreCost: 30,
  streakWeeklyCoins: 10,
  freeReconnectMinutes: 10,
  vibeHourStart: 21 * 60,
  vibeHourMinutes: 60,
  vibeHourGemBonusPercent: 0,
  xpPerGoodCall: 10,
  xpPerLikeReceived: 5,
  xpPerGiftReceived: 5,
  xpPerCheckIn: 5,
  xpPerStreakDay: 2,
  maxEngagementPushesPerDay: 3,

  inviteRewardCoins: 100,
  inviteeRewardCoins: 50,
  referralActivationCalls: 3,
  referralRequireVerified: 1,
  referralHoldHours: 24,
  maxReferralRewardsPerDay: 10,
  referralMilestone1: 3,
  referralMilestone1VipDays: 7,
  referralMilestone2: 10,
  referralMilestone2VipDays: 30,
  referralMilestone3: 25,
  referralMilestone3Coins: 1000,

  affiliateRevSharePercent: 20,
  affiliateCommissionMonths: 6,
  affiliateCpaUsdCents: 10,
  affiliateStoreFeePercent: 15,
  affiliateHoldDays: 14,
  affiliateMinPayoutUsdCents: 1000,

  storeFeeShare: 0.15,
  walletFeeShare: 0.02,
  cardFeeShare: 0.03,
  bankFeeShare: 0,

  minAge: 18,
  autoBanReports: 3,
  autoBanWindowHours: 24,
  autoBanHours: 24,
};

const ruleSchema = (f: RuleField): z.ZodTypeAny => {
  const n = z.number({ invalid_type_error: `${f.label}: enter a number` });
  const bounded = (s: z.ZodNumber) => s.min(f.min, `${f.label}: at least ${f.min}`).max(f.max, `${f.label}: at most ${f.max}`);
  if (f.kind === 'days7') return z.array(bounded(n.int(`${f.label}: whole coins only`)), { invalid_type_error: `${f.label}: seven numbers` }).length(7, `${f.label}: exactly seven days`);
  if (f.kind === 'share' || (f.kind === 'cents' && !f.whole)) return bounded(n);
  return bounded(n.int(`${f.label}: whole numbers only`));
};

export const RulesSchema = z.object(Object.fromEntries(RULE_FIELDS.map((f) => [f.key, ruleSchema(f)])) as Record<RuleKey, z.ZodTypeAny>).strict();
/** A change to some rules; the rest keep their values. */
export const RulesPatchSchema = RulesSchema.partial().strict();

// ── packs, plans, gifts ──────────────────────────────────────────────────────

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  usdCents: number;
  bonusPercent: number;
  tag?: string;
}

export interface VipPlan {
  id: string;
  label: string;
  days: number;
  usdCents: number;
  savePercent: number;
  trialDays: number;
  highlighted: boolean;
}

export interface Gift {
  id: string;
  name: string;
  emoji: string;
  coins: number;
}

const productId = z.string().regex(/^[a-z0-9_]{2,40}$/, 'Ids are 2–40 lowercase letters, digits or _ (they match the store product ids)');
const text = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max, `${label}: at most ${max} characters`);
const int = (label: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${label}: enter a number` }).int(`${label}: whole numbers only`).min(min, `${label}: at least ${min}`).max(max, `${label}: at most ${max}`);

const uniqueIds = <T extends { id: string }>(items: T[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  for (const [i, it] of items.entries()) {
    if (seen.has(it.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Two items have the id "${it.id}"`, path: [i, 'id'] });
    seen.add(it.id);
  }
};

export const PacksSchema = z
  .array(
    z
      .object({
        id: productId,
        name: text('Name', 30),
        coins: int('Coins', 1, 1_000_000),
        usdCents: int('Price', 1, 1_000_000),
        bonusPercent: int('Bonus', 0, 500),
        tag: z.string().trim().max(24, 'Tag: at most 24 characters').nullish(),
      })
      .strict()
      .transform(({ tag, ...p }): CoinPack => (tag ? { ...p, tag } : p)),
  )
  .min(1, 'Keep at least one coin pack')
  .max(12, 'At most 12 coin packs')
  .superRefine(uniqueIds);

export const PlansSchema = z
  .array(
    z
      .object({
        id: productId,
        label: text('Name', 30),
        days: int('Days', 1, 3660),
        usdCents: int('Price', 1, 1_000_000),
        savePercent: int('Saving', 0, 95),
        trialDays: int('Trial', 0, 30),
        highlighted: z.boolean(),
      })
      .strict(),
  )
  .min(1, 'Keep at least one VIP plan')
  .max(6, 'At most 6 VIP plans')
  .superRefine(uniqueIds)
  .superRefine((plans, ctx) => {
    if (plans.filter((p) => p.highlighted).length > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Feature one plan at most' });
  });

export const GiftsSchema = z
  .array(
    z
      .object({
        id: productId,
        name: text('Name', 24),
        emoji: text('Emoji', 8),
        coins: int('Cost', 1, 100_000),
      })
      .strict(),
  )
  .min(1, 'Keep at least one gift')
  .max(24, 'At most 24 gifts')
  .superRefine(uniqueIds);

export const DEFAULT_PACKS: CoinPack[] = [
  { id: 'starter', name: 'Starter', coins: 100, usdCents: 99, bonusPercent: 0 },
  { id: 'popular', name: 'Popular', coins: 550, usdCents: 499, bonusPercent: 0, tag: 'Most popular' },
  { id: 'value', name: 'Value', coins: 1200, usdCents: 999, bonusPercent: 0, tag: 'Best value' },
  { id: 'pro', name: 'Pro', coins: 3000, usdCents: 2499, bonusPercent: 10 },
  { id: 'whale', name: 'Big spender', coins: 6500, usdCents: 4999, bonusPercent: 30 },
];

export const DEFAULT_PLANS: VipPlan[] = [
  { id: 'vip_week', label: 'Weekly', days: 7, usdCents: 299, savePercent: 0, trialDays: 0, highlighted: false },
  { id: 'vip_month', label: 'Monthly', days: 30, usdCents: 799, savePercent: 0, trialDays: 3, highlighted: true },
  { id: 'vip_year', label: 'Yearly', days: 365, usdCents: 4999, savePercent: 48, trialDays: 0, highlighted: false },
];

export const DEFAULT_GIFTS: Gift[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', coins: 5 },
  { id: 'heart', name: 'Heart', emoji: '💖', coins: 20 },
  { id: 'coffee', name: 'Coffee', emoji: '☕', coins: 50 },
  { id: 'fireworks', name: 'Fireworks', emoji: '🎆', coins: 100 },
  { id: 'crown', name: 'Crown', emoji: '👑', coins: 500 },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', coins: 1000 },
];

// ── sections ─────────────────────────────────────────────────────────────────

export const ECONOMY_SECTIONS = ['rules', 'packs', 'plans', 'gifts'] as const;
export type EconomySection = (typeof ECONOMY_SECTIONS)[number];
export const isEconomySection = (s: string): s is EconomySection => (ECONOMY_SECTIONS as readonly string[]).includes(s);

export interface EconomySnapshot {
  rules: EconomyRules;
  packs: CoinPack[];
  plans: VipPlan[];
  gifts: Gift[];
}

export const DEFAULT_ECONOMY: EconomySnapshot = { rules: DEFAULT_RULES, packs: DEFAULT_PACKS, plans: DEFAULT_PLANS, gifts: DEFAULT_GIFTS };

// ── fixed lists (not editable) ───────────────────────────────────────────────

export const COUNTRY_CODES = [
  'PK', 'IN', 'US', 'GB', 'TR', 'BR', 'DE', 'FR', 'AE', 'SA', 'ID', 'PH', 'KR', 'JP', 'MX', 'NG', 'EG', 'CA', 'AU', 'ES',
] as const;

export const INTERESTS = [
  'Music', 'Gaming', 'Travel', 'Movies', 'Cricket', 'Football', 'Anime', 'Cooking', 'Fitness', 'Art',
  'Photography', 'Books', 'Tech', 'Fashion', 'Dance', 'Languages', 'Pets', 'Cars', 'Coffee', 'Memes',
] as const;

// ── pure helpers (take the live values as arguments) ─────────────────────────

/** Gems the receiver earns for a gift. */
export const gemsFor = (gift: Pick<Gift, 'coins'>, rules: Pick<EconomyRules, 'giftGemShare'>): number => Math.round(gift.coins * rules.giftGemShare);

/** Coins in a pack including its bonus. */
export const packTotalCoins = (p: Pick<CoinPack, 'coins' | 'bonusPercent'>): number => p.coins + Math.round((p.coins * p.bonusPercent) / 100);

export const gemsToUsdCents = (gems: number, rules: Pick<EconomyRules, 'usdCentsPerGem'>): number => Math.floor(gems * rules.usdCentsPerGem);

export interface MatchFilterInput {
  gender: 'ANYONE' | 'WOMEN' | 'MEN';
  countryCode?: string | null;
  safeMode?: boolean;
}

/** Coins one match costs with these filters; VIP pays nothing. */
export function filterCost(f: MatchFilterInput, vip: boolean, rules: Pick<EconomyRules, 'genderFilterCost' | 'regionFilterCost'>): number {
  if (vip) return 0;
  let cost = 0;
  if (f.gender !== 'ANYONE') cost += rules.genderFilterCost;
  if (f.countryCode) cost += rules.regionFilterCost;
  return cost;
}
