import { country } from "../catalog";
import type {
  Badge,
  Board,
  CallGame,
  ChatMessage,
  FollowEntry,
  FollowSettings,
  FollowState,
  Friend,
  FriendState,
  GameId,
  Gender,
  Gift,
  Leaderboard,
  LevelProgress,
  MatchRecord,
  MePrefs,
  Moment,
  MomentGroup,
  PaymentMethod,
  Profile,
  ProfileTier,
  ProfileView,
  Progress,
  StreakView,
  TeamMessage,
  Transaction,
  TxKind,
  VibeHour,
  Wallet,
  WeeklyRecap,
} from "../models";

/**
 * JSON from the Vibe API → the app's models. One place, so a field rename on
 * the server is a one-line change here (mirror of the Flutter `ApiMap`).
 */
export type Json = Record<string, unknown>;

export const asMap = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const int = (v: unknown) => (typeof v === "number" ? Math.trunc(v) : 0);
export const num = (v: unknown) => (typeof v === "number" ? v : 0);
export const str = (v: unknown) => (typeof v === "string" ? v : "");
export const optStr = (v: unknown) => (typeof v === "string" ? v : null);
export const bool = (v: unknown) => v === true;
export const date = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const gender = (g: unknown): Gender => (g === "male" ? "male" : g === "female" ? "female" : "other");

export function profile(m: Json): Profile {
  return {
    id: str(m.id),
    name: str(m.name),
    age: int(m.age),
    gender: gender(m.gender),
    country: country(optStr(m.countryCode) ?? "PK"),
    avatarUrl: str(m.avatarUrl),
    bio: str(m.bio),
    interests: asList(m.interests).filter((x): x is string => typeof x === "string"),
    verified: bool(m.verified),
    vip: bool(m.vip),
    matches: int(m.matches),
    likes: int(m.likes),
    level: Math.max(1, int(m.level)),
  };
}

/** The server's wallet view, reduced to what the screens read. */
export function wallet(m: Json): Wallet {
  const checkIn = asMap(m.checkIn);
  return {
    coins: int(m.coins),
    gems: int(m.gems),
    vipUntil: date(asMap(m.vip).until),
    boostUntil: date(asMap(m.boost).until),
    streakDay: int(checkIn.streakDay),
    lastCheckIn: date(checkIn.lastAt),
    profileBonusClaimed: bool(m.profileBonusClaimed),
    gemGoal: typeof m.gemGoal === "number" ? Math.trunc(m.gemGoal) : null,
    freeBoosts: int(m.freeBoosts),
  };
}

const METHODS: Record<string, PaymentMethod> = {
  GOOGLE_PLAY: "googlePlay",
  APP_STORE: "appStore",
  JAZZCASH: "jazzCash",
  EASYPAISA: "easypaisa",
  CARD: "card",
  BANK: "bank",
};

export const paymentMethodFromApi = (m: unknown): PaymentMethod | null => (typeof m === "string" ? (METHODS[m] ?? null) : null);

export const paymentMethodToApi = (m: PaymentMethod) => Object.keys(METHODS).find((k) => METHODS[k] === m)!;

const TX_KINDS: TxKind[] = ["purchase", "spend", "gift", "cashout", "vip"];

export function transaction(m: Json): Transaction {
  const kind = TX_KINDS.includes(m.kind as TxKind) ? (m.kind as TxKind) : "earn";
  return {
    id: str(m.id),
    kind,
    title: str(m.title),
    coins: int(m.coins),
    gems: int(m.gems),
    usd: num(m.usd),
    at: date(m.at) ?? new Date(),
    method: paymentMethodFromApi(m.method),
    receipt: optStr(m.receipt),
  };
}

export function friend(m: Json): Friend {
  return {
    profile: profile(asMap(m.profile)),
    state: m.state === "friends" ? "friends" : m.state === "requested" ? "requested" : "incoming",
    since: date(m.since) ?? new Date(),
    lastMessage: optStr(m.lastMessage),
    unread: int(m.unread),
    online: bool(m.online),
    streak: streak(asMap(m.streak)),
  };
}

export const streak = (m: Json): StreakView => ({
  count: int(m.count),
  best: int(m.best),
  today: bool(m.today),
  atRisk: bool(m.atRisk),
  mineToday: bool(m.mineToday),
  theirsToday: bool(m.theirsToday),
  restorable: bool(m.restorable),
  lostCount: int(m.lostCount),
  restoreCost: int(m.restoreCost),
});

export function teamMessage(m: Json): TeamMessage {
  return {
    id: str(m.id),
    title: str(m.title),
    body: str(m.body),
    at: date(m.createdAt) ?? new Date(),
    buttonLabel: optStr(m.buttonLabel),
    buttonUrl: optStr(m.buttonUrl),
    read: bool(m.read),
  };
}

export function message(m: Json, giftById: (id: unknown) => Gift | null): ChatMessage {
  return { id: str(m.id), fromMe: bool(m.fromMe), text: str(m.text), at: date(m.at) ?? new Date(), gift: giftById(m.giftId) };
}

export function matchRecord(m: Json): MatchRecord | null {
  const p = m.partner;
  if (!p || typeof p !== "object") return null;
  return {
    id: str(m.id),
    partner: profile(asMap(p)),
    startedAt: date(m.startedAt) ?? new Date(),
    endedAt: date(m.endedAt),
    liked: bool(m.liked),
    likedMe: bool(m.likedMe),
    giftsSent: int(m.giftsSent),
    giftsReceived: int(m.giftsReceived),
    coinsSpent: int(m.coinsSpent),
  };
}

const TIERS: ProfileTier[] = ["self", "matched", "following", "friends"];
const FRIEND_STATES: Exclude<FriendState, "blocked">[] = ["none", "requested", "incoming", "friends"];

export const followState = (v: unknown): FollowState => (v === "following" || v === "requested" ? v : "none");

export function profileView(m: Json): ProfileView {
  const rel = asMap(m.rel);
  const counts = m.counts && typeof m.counts === "object" ? asMap(m.counts) : null;
  const stats = m.stats;
  return {
    profile: profile(asMap(m.profile)),
    tier: TIERS.find((x) => x === m.tier) ?? "matched",
    follow: followState(rel.follow),
    followsYou: bool(rel.followsYou),
    friend: FRIEND_STATES.find((x) => x === rel.friend) ?? "none",
    counts: counts ? { followers: int(counts.followers), following: int(counts.following) } : null,
    stats: stats === "hidden" ? "hidden" : stats && typeof stats === "object" ? { matches: int(asMap(stats).matches), likes: int(asMap(stats).likes), gifts: int(asMap(stats).gifts) } : null,
    online: typeof m.online === "boolean" ? m.online : null,
    level: Math.max(1, int(m.level ?? asMap(m.profile).level)),
    badges: asList(m.badges).filter((x): x is string => typeof x === "string"),
  };
}

export const followEntry = (m: Json): FollowEntry => ({ profile: profile(asMap(m.profile)), since: date(m.since) ?? new Date(), followsBack: bool(m.followsBack) });

/** The follow part of GET/PATCH /me. */
export const followSettings = (m: Json): FollowSettings => ({ followers: int(m.followers), following: int(m.following), privateAccount: bool(m.privateAccount), hideStats: bool(m.hideStats) });

const optInt = (v: unknown) => (typeof v === "number" ? Math.trunc(v) : null);

/** The engagement fields of GET/PATCH /me. */
export const mePrefs = (m: Json): MePrefs => ({
  xp: int(m.xp),
  gemGoal: optInt(m.gemGoal),
  quietHoursStart: optInt(m.quietHoursStart),
  quietHoursEnd: optInt(m.quietHoursEnd),
  tzOffsetMinutes: typeof m.tzOffsetMinutes === "number" ? Math.trunc(m.tzOffsetMinutes) : 300,
  breakReminderMinutes: optInt(m.breakReminderMinutes),
});

export const levelProgress = (m: Json): LevelProgress => ({ level: Math.max(1, int(m.level)), xp: int(m.xp), levelXp: int(m.levelXp), nextLevelXp: int(m.nextLevelXp) });

const badge = (m: Json): Badge => ({ id: str(m.id), name: str(m.name), emoji: str(m.emoji), earned: bool(m.earned), progress: int(m.progress), target: Math.max(1, int(m.target)) });

export const progress = (m: Json): Progress => ({ ...levelProgress(m), weekXp: int(m.weekXp), badges: asList(m.badges).map((b) => badge(asMap(b))) });

export const vibeHour = (m: Json): VibeHour => ({ active: bool(m.active), startsAt: date(m.startsAt), endsAt: date(m.endsAt) });

export const leaderboard = (m: Json): Leaderboard => {
  const me = asMap(m.me);
  return {
    board: (m.board === "gems" ? "gems" : "xp") as Board,
    weekStart: date(m.weekStart) ?? new Date(),
    weekEnd: date(m.weekEnd) ?? new Date(),
    top: asList(m.top).map((r) => {
      const row = asMap(r);
      return { rank: int(row.rank), profile: profile(asMap(row.profile)), score: int(row.score) };
    }),
    me: { rank: optInt(me.rank), score: int(me.score) },
  };
};

export const weeklyRecap = (m: Json): WeeklyRecap => ({
  weekStart: date(m.weekStart) ?? new Date(),
  weekEnd: date(m.weekEnd) ?? new Date(),
  gemsEarned: int(m.gemsEarned),
  giftsReceived: int(m.giftsReceived),
  likesReceived: int(m.likesReceived),
  newFollowers: int(m.newFollowers),
  matches: int(m.matches),
  bestStreak: int(m.bestStreak),
});

export const moment = (m: Json): Moment => ({
  id: str(m.id),
  mediaUrl: str(m.mediaUrl),
  caption: str(m.caption),
  createdAt: date(m.createdAt) ?? new Date(),
  expiresAt: date(m.expiresAt) ?? new Date(),
  seen: bool(m.seen),
  viewsCount: optInt(m.viewsCount),
});

export const momentFeed = (m: Json): { mine: Moment[]; people: MomentGroup[] } => ({
  mine: asList(m.mine).map((x) => moment(asMap(x))),
  people: asList(m.people)
    .map((x) => {
      const g = asMap(x);
      return { author: profile(asMap(g.author)), moments: asList(g.moments).map((y) => moment(asMap(y))), allSeen: bool(g.allSeen) };
    })
    .filter((g) => g.moments.length > 0),
});

const GAMES: GameId[] = ["wyr", "this_or_that", "questions"];

/** `match:game` (event or start/next ack) → a fresh round. */
export function callGame(m: Json): CallGame | null {
  const game = GAMES.find((g) => g === m.game);
  const prompt = asMap(m.prompt);
  if (!game || typeof m.round !== "number") return null;
  const opts = asList(prompt.options).filter((x): x is string => typeof x === "string");
  return { game, round: m.round, text: str(prompt.text), options: opts.length === 2 ? [opts[0], opts[1]] : null, by: m.by === "partner" ? "partner" : "me", mine: null, theirs: null, partnerAnswered: false, revealed: false };
}

/** `match:game-answer` applied to the open round (ignored for another round). */
export function applyGameAnswer(g: CallGame, m: Json): CallGame {
  if (m.round !== g.round) return g;
  const choice = (v: unknown, answered: boolean) => (v === 0 || v === 1 ? v : answered ? -1 : null);
  const revealed = bool(m.revealed);
  const partnerAnswered = bool(m.partnerAnswered) || revealed;
  // `mine` is null for an open question even once answered; the server only says so through `revealed`/our own ack.
  const mine = choice(m.mine, revealed) ?? g.mine;
  return { ...g, mine, theirs: revealed ? choice(m.theirs, true) : null, partnerAnswered, revealed };
}
