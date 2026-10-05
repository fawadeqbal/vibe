import { country } from "../catalog";
import type { ChatMessage, Friend, Gender, Gift, MatchRecord, PaymentMethod, Profile, TeamMessage, Transaction, TxKind, Wallet } from "../models";

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
  };
}

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
