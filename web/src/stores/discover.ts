import { create } from "zustand";

import { ApiError } from "@/lib/api/errors";
import { asList, asMap, friend as mapFriend, type Json, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { notifyInBackground } from "@/lib/browser-notify";
import type { Friend, Profile } from "@/lib/models";

import { api, realtime } from "./services";
import { useSocial } from "./social";

/** One person in the deck. */
export interface DiscoverCard {
  profile: Profile;
  online: boolean;
  lastSeenAt: Date | null;
  /** They Super Liked you (shown with a star). */
  superLikedMe: boolean;
  sharedInterests: string[];
}

export interface DiscoverStatus {
  enabled: boolean;
  vip: boolean;
  /** null = unlimited (VIP). */
  likesLeft: number | null;
  freeLikesPerDay: number;
  resetsAt: Date | null;
  freeSuperLikesLeft: number;
  superLikeCost: number;
  undoCost: number;
  packSize: number;
  packCost: number;
  visible: boolean;
  showInDiscover: boolean;
  hasPhoto: boolean;
  likedYou: { count: number; unseen: number };
  /** Gender, country, online now and verified filters: open with VIP, Vibe Hour or a filter pass. */
  filters: FilterAccess;
}

export interface FilterAccess {
  unlocked: boolean;
  reason: "free" | "vip" | "vibe_hour" | "pass" | null;
  passUntil: Date | null;
  passCost: number;
  passHours: number;
}

export type WantedGender = "anyone" | "women" | "men";
export interface DiscoverFilters {
  gender: WantedGender;
  minAge: number;
  maxAge: number;
  /** Two-letter code; "" = anywhere. */
  countryCode: string;
  onlineOnly: boolean;
  verifiedOnly: boolean;
}

/** The filters that need VIP, Vibe Hour or a pass (age is free for everyone). */
export const usesExtraFilters = (f: DiscoverFilters): boolean => f.gender !== "anyone" || !!f.countryCode || f.onlineOnly || f.verifiedOnly;
/** Just the free part (age) of some filters. */
export const freeOnly = (f: DiscoverFilters): DiscoverFilters => ({ ...DEFAULT_DISCOVER_FILTERS, minAge: f.minAge, maxAge: f.maxAge });

export type SwipeKind = "like" | "super" | "pass";

/** What a swipe did, so the screen can react (match dialog, out-of-likes sheet, coins). */
export type SwipeOutcome = { ok: true; matched: Friend | null } | { ok: false; reason: "out-of-likes" | "coins" | "error"; message?: string };

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = { gender: "anyone", minAge: 18, maxAge: 60, countryCode: "", onlineOnly: false, verifiedOnly: false };
const FILTERS_KEY = "vibe.discover.filters";

const card = (m: Json): DiscoverCard => ({
  profile: mapProfile(asMap(m.profile)),
  online: m.online === true,
  lastSeenAt: typeof m.lastSeenAt === "string" ? new Date(m.lastSeenAt) : null,
  superLikedMe: m.superLikedMe === true,
  sharedInterests: asList(m.sharedInterests).filter((x): x is string => typeof x === "string"),
});

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);

const status = (m: Json): DiscoverStatus => {
  const liked = asMap(m.likedYou);
  return {
    enabled: m.enabled !== false,
    vip: m.vip === true,
    likesLeft: typeof m.likesLeft === "number" ? m.likesLeft : null,
    freeLikesPerDay: num(m.freeLikesPerDay, 30),
    resetsAt: typeof m.resetsAt === "string" ? new Date(m.resetsAt) : null,
    freeSuperLikesLeft: num(m.freeSuperLikesLeft),
    superLikeCost: num(m.superLikeCost, 10),
    undoCost: num(m.undoCost),
    packSize: num(m.packSize, 30),
    packCost: num(m.packCost, 20),
    visible: m.visible === true,
    showInDiscover: m.showInDiscover !== false,
    hasPhoto: m.hasPhoto === true,
    likedYou: { count: num(liked.count), unseen: num(liked.unseen) },
    filters: filterAccess(asMap(m.filters)),
  };
};

const filterAccess = (m: Json): FilterAccess => {
  const reason = m.reason;
  return {
    unlocked: m.unlocked !== false,
    reason: reason === "free" || reason === "vip" || reason === "vibe_hour" || reason === "pass" ? reason : null,
    passUntil: typeof m.passUntil === "string" ? new Date(m.passUntil) : null,
    passCost: num(m.passCost, 25),
    passHours: num(m.passHours, 24),
  };
};

function saveFilters(f: DiscoverFilters) {
  try {
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {}
}

function readFilters(): DiscoverFilters {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(FILTERS_KEY) : null;
    if (!raw) return DEFAULT_DISCOVER_FILTERS;
    const f = JSON.parse(raw) as Partial<DiscoverFilters>;
    return {
      gender: f.gender === "women" || f.gender === "men" ? f.gender : "anyone",
      minAge: Math.min(99, Math.max(18, Number(f.minAge) || 18)),
      maxAge: Math.min(99, Math.max(18, Number(f.maxAge) || 60)),
      countryCode: typeof f.countryCode === "string" && /^[A-Z]{2}$/.test(f.countryCode) ? f.countryCode : "",
      onlineOnly: f.onlineOnly === true,
      verifiedOnly: f.verifiedOnly === true,
    };
  } catch {
    return DEFAULT_DISCOVER_FILTERS;
  }
}

/**
 * Discover (GET /discover/deck, POST /discover/swipes…): a deck of real
 * people, one at a time. Two likes make a match — friends, chat open. The
 * server counts likes and charges coins; this keeps the deck, the counters
 * and the "liked you" list, and opens the match dialog (`matched`).
 */
interface DiscoverState {
  deck: DiscoverCard[];
  loading: boolean;
  /** The last load found nobody left. */
  exhausted: boolean;
  /** The last load failed (offline, server down): the screen offers Try again. */
  failed: boolean;
  status: DiscoverStatus | null;
  filters: DiscoverFilters;
  /** A pass that can still be undone (the card it was). */
  lastPassed: DiscoverCard | null;
  /** "Liked you": VIP gets people, everyone else blurred previews. */
  likedYou: { unlocked: boolean; people: DiscoverCard[]; previews: string[]; count: number } | null;
  /** The filter pass ran out while extra filters were on: they were turned off (the screen says so once). */
  filtersExpired: boolean;
  /** The match to celebrate (from your swipe, or theirs over the socket). */
  matched: Friend | null;

  load: () => Promise<void>;
  loadStatus: () => Promise<void>;
  /** Tops the deck up when it runs low. */
  refill: () => Promise<void>;
  setFilters: (f: DiscoverFilters) => void;
  swipe: (c: DiscoverCard, kind: SwipeKind) => Promise<SwipeOutcome>;
  /** False with "coins" when it can't be paid for. */
  undo: () => Promise<"ok" | "coins" | "nothing">;
  buyLikes: () => Promise<"ok" | "coins">;
  /** Opens the extra filters for a while; "coins" when short. */
  buyFilterPass: () => Promise<"ok" | "coins">;
  clearFiltersExpired: () => void;
  loadLikedYou: () => Promise<void>;
  markLikesSeen: () => void;
  setVisible: (visible: boolean) => Promise<void>;
  dismissMatch: () => void;
  reset: () => void;
}

let loadingDeck: Promise<void> | null = null;

export const useDiscover = create<DiscoverState>()((set, get) => {
  const fetchDeck = async (replace: boolean) => {
    const f = get().filters;
    const q = {
      gender: f.gender,
      minAge: f.minAge,
      maxAge: f.maxAge,
      ...(f.countryCode ? { countryCode: f.countryCode } : {}),
      ...(f.onlineOnly ? { onlineOnly: "true" } : {}),
      ...(f.verifiedOnly ? { verifiedOnly: "true" } : {}),
      limit: 20,
    };
    let r: Json;
    try {
      r = asMap(await api.get("/discover/deck", q));
    } catch (e) {
      // The pass ran out (or VIP ended): keep age, drop the rest, tell the screen.
      if (e instanceof ApiError && e.code === "FILTERS_LOCKED" && usesExtraFilters(f)) {
        const free = freeOnly(f);
        saveFilters(free);
        set({ filters: free, filtersExpired: true });
        void get().loadStatus();
        return fetchDeck(replace);
      }
      throw e;
    }
    const fresh = asList(r.items).map((e) => card(asMap(e)));
    set((s) => {
      const have = new Set(replace ? [] : s.deck.map((c) => c.profile.id));
      const deck = replace ? fresh : [...s.deck, ...fresh.filter((c) => !have.has(c.profile.id))];
      return { deck, exhausted: fresh.length === 0 || (replace && !deck.length) };
    });
  };

  return {
    deck: [],
    loading: false,
    exhausted: false,
    failed: false,
    status: null,
    filters: DEFAULT_DISCOVER_FILTERS,
    lastPassed: null,
    likedYou: null,
    matched: null,
    filtersExpired: false,

    async load() {
      if (!api.hasSession) return;
      if (loadingDeck) return loadingDeck;
      set({ loading: true, filters: readFilters() });
      loadingDeck = (async () => {
        try {
          await Promise.all([get().loadStatus(), fetchDeck(true)]);
          set({ failed: false });
        } catch {
          // The screen shows what it has, or "can't reach Vibe" with Try again.
          set({ failed: true });
        } finally {
          set({ loading: false });
          loadingDeck = null;
        }
      })();
      return loadingDeck;
    },

    async loadStatus() {
      if (!api.hasSession) return;
      try {
        set({ status: status(asMap(await api.get("/discover/status"))) });
      } catch {}
    },

    async refill() {
      if (get().deck.length > 4 || get().loading) return;
      try {
        await fetchDeck(false);
      } catch {}
    },

    setFilters(f) {
      saveFilters(f);
      set({ filters: f, deck: [], lastPassed: null, filtersExpired: false });
      set({ loading: true });
      void fetchDeck(true)
        .then(() => set({ failed: false }))
        .catch(() => set({ failed: true }))
        .finally(() => set({ loading: false }));
    },

    async swipe(c, kind) {
      // Off the deck at once; put back if the server says no.
      const before = get().deck;
      set({ deck: before.filter((x) => x.profile.id !== c.profile.id) });
      try {
        const r = asMap(await api.post("/discover/swipes", { userId: c.profile.id, kind }));
        const friend = r.matched === true && r.friend ? mapFriend(asMap(r.friend)) : null;
        set({ status: status(asMap(r.status)), lastPassed: kind === "pass" ? c : null, ...(friend ? { matched: friend } : {}) });
        if (friend) void useSocial.getState().refreshFriends();
        void get().refill();
        return { ok: true, matched: friend };
      } catch (e) {
        set((s) => ({ deck: [c, ...s.deck.filter((x) => x.profile.id !== c.profile.id)] }));
        if (e instanceof ApiError && e.code === "OUT_OF_LIKES") {
          set((s) => (s.status ? { status: { ...s.status, likesLeft: 0 } } : {}));
          return { ok: false, reason: "out-of-likes" };
        }
        if (e instanceof ApiError && e.isInsufficientCoins) return { ok: false, reason: "coins" };
        return { ok: false, reason: "error", message: e instanceof Error ? e.message : undefined };
      }
    },

    async undo() {
      try {
        const r = asMap(await api.post("/discover/undo"));
        const back = card(asMap(r.card));
        set((s) => ({ deck: [back, ...s.deck.filter((x) => x.profile.id !== back.profile.id)], lastPassed: null, status: status(asMap(r.status)) }));
        return "ok";
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return "coins";
        if (e instanceof ApiError && e.code === "NOTHING_TO_UNDO") {
          set({ lastPassed: null });
          return "nothing";
        }
        throw e;
      }
    },

    async buyLikes() {
      try {
        set({ status: status(asMap(await api.post("/discover/likes/buy"))) });
        return "ok";
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return "coins";
        throw e;
      }
    },

    async buyFilterPass() {
      try {
        set({ status: status(asMap(await api.post("/discover/filter-pass"))) });
        return "ok";
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return "coins";
        throw e;
      }
    },

    clearFiltersExpired() {
      set({ filtersExpired: false });
    },

    async loadLikedYou() {
      try {
        const r = asMap(await api.get("/discover/liked-you"));
        set({
          likedYou: {
            unlocked: r.unlocked === true,
            people: asList(r.people).map((e) => card(asMap(e))),
            previews: asList(r.previews).map(String),
            count: num(r.count),
          },
        });
      } catch {}
    },

    markLikesSeen() {
      set((s) => (s.status ? { status: { ...s.status, likedYou: { ...s.status.likedYou, unseen: 0 } } } : {}));
      api.post("/discover/liked-you/seen").catch(() => {});
    },

    async setVisible(visible) {
      set({ status: status(asMap(await api.put("/discover/visibility", { visible }))) });
    },

    dismissMatch() {
      set({ matched: null });
    },

    reset() {
      set({ deck: [], loading: false, exhausted: false, failed: false, status: null, lastPassed: null, likedYou: null, matched: null, filtersExpired: false });
    },
  };
});

/** Count shown on the Discover tab: new likes waiting. */
export const discoverBadge = (s: Pick<DiscoverState, "status">) => s.status?.likedYou.unseen ?? 0;

// ── server events ──────────────────────────────────────────────────────────

realtime.on(Ev.discoverMatch, (e) => {
  const friend = mapFriend(asMap(e.friend));
  useDiscover.setState((s) => ({ matched: s.matched ?? friend, deck: s.deck.filter((c) => c.profile.id !== friend.profile.id) }));
  void useSocial.getState().refreshFriends();
  void useDiscover.getState().loadStatus();
  notifyInBackground("It's a match! 💞", `You and ${friend.profile.name.split(" ")[0]} liked each other.`, { tag: `discover-match:${friend.profile.id}` });
});

realtime.on(Ev.discoverLiked, (e) => {
  const unseen = typeof e.unseen === "number" ? e.unseen : null;
  useDiscover.setState((s) =>
    s.status && unseen != null ? { status: { ...s.status, likedYou: { count: Math.max(s.status.likedYou.count, unseen), unseen } } } : {},
  );
  if (e.superLike === true && e.from) {
    const from: Profile = mapProfile(asMap(e.from));
    notifyInBackground(`${from.name.split(" ")[0]} Super Liked you ⭐`, "Open Discover to see them first.", { tag: `discover-super:${from.id}` });
  }
  if (!useDiscover.getState().status) void useDiscover.getState().loadStatus();
});
