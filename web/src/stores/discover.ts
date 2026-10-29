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
}

export type WantedGender = "anyone" | "women" | "men";
export interface DiscoverFilters {
  gender: WantedGender;
  minAge: number;
  maxAge: number;
}

export type SwipeKind = "like" | "super" | "pass";

/** What a swipe did, so the screen can react (match dialog, out-of-likes sheet, coins). */
export type SwipeOutcome = { ok: true; matched: Friend | null } | { ok: false; reason: "out-of-likes" | "coins" | "error"; message?: string };

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = { gender: "anyone", minAge: 18, maxAge: 60 };
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
  };
};

function readFilters(): DiscoverFilters {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(FILTERS_KEY) : null;
    if (!raw) return DEFAULT_DISCOVER_FILTERS;
    const f = JSON.parse(raw) as Partial<DiscoverFilters>;
    return {
      gender: f.gender === "women" || f.gender === "men" ? f.gender : "anyone",
      minAge: Math.min(99, Math.max(18, Number(f.minAge) || 18)),
      maxAge: Math.min(99, Math.max(18, Number(f.maxAge) || 60)),
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
  status: DiscoverStatus | null;
  filters: DiscoverFilters;
  /** A pass that can still be undone (the card it was). */
  lastPassed: DiscoverCard | null;
  /** "Liked you": VIP gets people, everyone else blurred previews. */
  likedYou: { unlocked: boolean; people: DiscoverCard[]; previews: string[]; count: number } | null;
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
    const r = asMap(await api.get("/discover/deck", { gender: f.gender, minAge: f.minAge, maxAge: f.maxAge, limit: 20 }));
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
    status: null,
    filters: DEFAULT_DISCOVER_FILTERS,
    lastPassed: null,
    likedYou: null,
    matched: null,

    async load() {
      if (!api.hasSession) return;
      if (loadingDeck) return loadingDeck;
      set({ loading: true, filters: readFilters() });
      loadingDeck = (async () => {
        try {
          await Promise.all([get().loadStatus(), fetchDeck(true)]);
        } catch {
          // The screen shows what it has; status says when Discover is off.
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
      try {
        window.localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
      } catch {}
      set({ filters: f, deck: [], lastPassed: null });
      set({ loading: true });
      void fetchDeck(true)
        .catch(() => {})
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
      set({ deck: [], loading: false, exhausted: false, status: null, lastPassed: null, likedYou: null, matched: null });
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
