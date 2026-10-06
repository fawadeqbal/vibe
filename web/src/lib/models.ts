/**
 * Every data shape the app works with — the same as the Flutter app's
 * `models.dart`, so both clients read the API the same way.
 */

export type Gender = "male" | "female" | "other";

export const genderLabel: Record<Gender, string> = {
  male: "Man",
  female: "Woman",
  other: "Non-binary",
};

export const GENDERS: Gender[] = ["male", "female", "other"];

/** Who the matcher should look for. `anyone` is free; the others cost coins unless VIP. */
export type GenderFilter = "anyone" | "women" | "men";

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  country: Country;
  avatarUrl: string;
  bio: string;
  interests: string[];
  verified: boolean;
  vip: boolean;
  matches: number;
  likes: number;
  /** From XP; shown as a "Lv 7" chip. */
  level: number;
}

/** "Photo, bio and 3 interests" unlocks the profile-completion bonus. */
export const isProfileComplete = (p: Profile) => p.bio.trim().length > 0 && p.interests.length >= 3 && p.avatarUrl.length > 0;

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  usd: number;
  bonusPercent: number;
  tag?: string | null;
}

export const usdPer100 = (p: CoinPack) => (p.usd / p.coins) * 100;

export interface VipPlan {
  id: string;
  /** "Weekly", "Monthly"… as named in the admin panel. */
  label: string;
  days: number;
  usd: number;
  savePercent: number;
  trialDays: number;
  highlighted: boolean;
}

/** "week", "month", "year" — or "90 days" for anything else. */
export function periodWord(p: VipPlan): string {
  switch (p.days) {
    case 7:
      return "week";
    case 30:
    case 31:
      return "month";
    case 365:
    case 366:
      return "year";
    default:
      return `${p.days} days`;
  }
}

export interface Gift {
  id: string;
  name: string;
  emoji: string;
  coins: number;
}

export type TxKind = "purchase" | "spend" | "earn" | "gift" | "cashout" | "vip";

export type PaymentMethod = "googlePlay" | "appStore" | "jazzCash" | "easypaisa" | "card" | "bank";

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  googlePlay: "Google Play",
  appStore: "App Store",
  jazzCash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Debit / credit card",
  bank: "Bank transfer",
};

export const paymentMethodHint: Record<PaymentMethod, string> = {
  googlePlay: "Billed by Google. Fastest.",
  appStore: "Billed by Apple.",
  jazzCash: "Pay from your JazzCash wallet.",
  easypaisa: "Pay from your Easypaisa wallet.",
  card: "Visa, Mastercard.",
  bank: "Manual transfer, verified within a day.",
};

export interface Transaction {
  id: string;
  kind: TxKind;
  title: string;
  /** Positive = coins in, negative = coins out. */
  coins: number;
  gems: number;
  usd: number;
  at: Date;
  method?: PaymentMethod | null;
  receipt?: string | null;
}

export interface Wallet {
  coins: number;
  gems: number;
  vipUntil: Date | null;
  boostUntil: Date | null;
  streakDay: number;
  lastCheckIn: Date | null;
  profileBonusClaimed: boolean;
  /** Gems you are saving towards (null = no goal). */
  gemGoal: number | null;
  /** Boosts given away (win-back); used before coins. */
  freeBoosts: number;
}

export interface MatchFilters {
  gender: GenderFilter;
  /** null = anywhere. */
  countryCode: string | null;
  safeMode: boolean;
}

export type FriendState = "none" | "requested" | "incoming" | "friends" | "blocked";

export interface Friend {
  profile: Profile;
  state: FriendState;
  since: Date;
  lastMessage: string | null;
  unread: number;
  online: boolean;
  streak: StreakView;
}

/** A friend streak from your side (the server derives it for "today"). */
export interface StreakView {
  count: number;
  best: number;
  /** Today already counted. */
  today: boolean;
  /** Counted yesterday, not yet today: ends at midnight. */
  atRisk: boolean;
  mineToday: boolean;
  theirsToday: boolean;
  /** Broke yesterday; `restoreCost` brings back `lostCount` (0 for VIP). */
  restorable: boolean;
  lostCount: number;
  restoreCost: number;
}

export const NO_STREAK: StreakView = { count: 0, best: 0, today: false, atRisk: false, mineToday: false, theirsToday: false, restorable: false, lostCount: 0, restoreCost: 0 };

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  text: string;
  at: Date;
  gift?: Gift | null;
  /** Extra gems on a received gift (Vibe Hour). */
  bonusGems?: number;
}

export type ReportReason = "nudity" | "harassment" | "underage" | "spam" | "scam" | "other";

export const REPORT_REASONS: ReportReason[] = ["nudity", "harassment", "underage", "spam", "scam", "other"];

export const reportReasonLabel: Record<ReportReason, string> = {
  nudity: "Nudity or sexual content",
  harassment: "Harassment or hate",
  underage: "Looks under 18",
  spam: "Spam or advertising",
  scam: "Scam or asking for money",
  other: "Something else",
};

/** One finished (or running) match, for history and stats. */
export interface MatchRecord {
  id: string;
  partner: Profile;
  startedAt: Date;
  endedAt: Date | null;
  liked: boolean;
  likedMe: boolean;
  giftsSent: number;
  giftsReceived: number;
  coinsSpent: number;
}

export const matchLengthSeconds = (r: MatchRecord, now = Date.now()) => Math.max(0, Math.floor(((r.endedAt?.getTime() ?? now) - r.startedAt.getTime()) / 1000));

/** A message from the Vibe team ("Messages from Vibe" in Chats). */
export interface TeamMessage {
  id: string;
  title: string;
  body: string;
  at: Date;
  buttonLabel: string | null;
  buttonUrl: string | null;
  read: boolean;
}

// ── follows ──────────────────────────────────────────────────────────────

/** How much of someone's profile you may see (the server decides). */
export type ProfileTier = "self" | "matched" | "following" | "friends";
/** Your follow towards someone. */
export type FollowState = "none" | "requested" | "following";
/** Your own lists (nobody else's are ever shown). */
export type FollowList = "followers" | "following" | "requests";

export interface ProfileStats {
  matches: number;
  likes: number;
  gifts: number;
}

/** GET /users/:id/view. `counts`/`stats` are null below the "following" tier. */
export interface ProfileView {
  profile: Profile;
  tier: ProfileTier;
  follow: FollowState;
  followsYou: boolean;
  friend: Exclude<FriendState, "blocked">;
  counts: { followers: number; following: number } | null;
  stats: ProfileStats | "hidden" | null;
  online: boolean | null;
  level: number;
  /** Earned badge ids. */
  badges: string[];
}

export interface FollowEntry {
  profile: Profile;
  since: Date;
  followsBack: boolean;
}

/** Your numbers and privacy switches (from GET /me). */
export interface FollowSettings {
  followers: number;
  following: number;
  privateAccount: boolean;
  hideStats: boolean;
}

// ── engagement ───────────────────────────────────────────────────────────

/** Level from XP: `levelXp` is where this level started, `nextLevelXp` where the next one starts. */
export interface LevelProgress {
  level: number;
  xp: number;
  levelXp: number;
  nextLevelXp: number;
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  earned: boolean;
  progress: number;
  target: number;
}

/** GET /me/progress. */
export interface Progress extends LevelProgress {
  weekXp: number;
  badges: Badge[];
}

/** The daily Vibe Hour: the current window if active, else the next one (null when off). */
export interface VibeHour {
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export type Board = "xp" | "gems";

export interface LeaderboardRow {
  rank: number;
  profile: Profile;
  score: number;
}

export interface Leaderboard {
  board: Board;
  weekStart: Date;
  weekEnd: Date;
  top: LeaderboardRow[];
  me: { rank: number | null; score: number };
}

/** Last week's numbers (GET /me/recap). */
export interface WeeklyRecap {
  weekStart: Date;
  weekEnd: Date;
  gemsEarned: number;
  giftsReceived: number;
  likesReceived: number;
  newFollowers: number;
  matches: number;
  bestStreak: number;
}

/** A 24-hour photo. `viewsCount` only on your own. */
export interface Moment {
  id: string;
  mediaUrl: string;
  caption: string;
  createdAt: Date;
  expiresAt: Date;
  seen: boolean;
  viewsCount: number | null;
}

export interface MomentGroup {
  author: Profile;
  moments: Moment[];
  allSeen: boolean;
}

export type GameId = "wyr" | "this_or_that" | "questions";

/** The icebreaker on screen during a call. */
export interface CallGame {
  game: GameId;
  round: number;
  text: string;
  /** Two options, or null for an open question. */
  options: [string, string] | null;
  by: "me" | "partner";
  /** Your answer (0/1; -1 = answered an open question), null = not yet. */
  mine: number | null;
  /** Theirs, only once both answered. */
  theirs: number | null;
  partnerAnswered: boolean;
  revealed: boolean;
}

/** Your settings from GET /me that the engagement screens edit. */
export interface MePrefs {
  xp: number;
  gemGoal: number | null;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  tzOffsetMinutes: number;
  breakReminderMinutes: number | null;
}
