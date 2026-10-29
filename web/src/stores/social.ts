import { create } from "zustand";

import { newIdempotencyKey } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { asList, asMap, friend as mapFriend, type Json, message as mapMessage, profile as mapProfile, streak as mapStreak } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { ChatMessage, Friend, FriendState, Gift, Profile, StreakView } from "@/lib/models";

import { useCatalog } from "./catalog";
import { api, realtime } from "./services";

/**
 * Friends, requests, blocks, chats with friends, and the "liked you" list.
 * Requests, acceptances and messages arrive live over the socket (mirror of
 * the Flutter `RemoteSocialProvider`).
 */
interface SocialState {
  all: Friend[];
  chats: Record<string, ChatMessage[]>;
  /** Friends typing to you right now (id → until when, ms). */
  typing: Record<string, number>;
  /** When each friend last read your messages ("Seen"). */
  seenAt: Record<string, Date>;
  blocked: string[];
  /** Free users only get blurred faces (placeholders); `likedYouCount` is the real number. */
  likedYou: Profile[];
  likedYouCount: number;
  loaded: boolean;

  load: () => Promise<void>;
  /** Re-reads just the friends list (presence, streaks). */
  refreshFriends: () => Promise<void>;
  /** Loads a conversation the first time it is opened. */
  ensureMessages: (friendId: string) => Promise<void>;
  leaveChat: (friendId: string) => void;
  /** False when it could not be paid for. */
  sendRequest: (p: Profile) => Promise<boolean>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  block: (p: Profile) => Promise<void>;
  unblock: (id: string) => Promise<void>;
  sendMessage: (friendId: string, text: string, replyToId?: string | null) => Promise<void>;
  /** A photo or voice note. Shown at once (faded) while it uploads. */
  sendMedia: (friendId: string, kind: "photo" | "voice", file: Blob, info?: { seconds?: number; w?: number; h?: number; replyToId?: string | null }) => Promise<void>;
  react: (friendId: string, messageId: string, emoji: string | null) => Promise<void>;
  unsend: (friendId: string, messageId: string) => Promise<void>;
  /** Tell them you're typing (throttled here: at most every 3 s). */
  typingTo: (friendId: string) => void;
  /** False when there aren't enough coins. */
  sendGift: (friendId: string, gift: Gift) => Promise<boolean>;
  markRead: (friendId: string) => void;
  /** Brings back a streak that broke yesterday. False when there aren't enough coins. */
  restoreStreak: (friendId: string) => Promise<boolean>;
  reset: () => void;
}

const loadedChats = new Set<string>();
let openChat: string | null = null;

const giftById = (id: unknown) => useCatalog.getState().gift(id);

export const useSocial = create<SocialState>()((set, get) => {
  const reloadFriends = async () => {
    try {
      set({ all: asList(await api.get("/friends")).map((e) => mapFriend(asMap(e))) });
    } catch {}
  };
  const reloadLikes = async () => {
    try {
      const r = asMap(await api.get("/likes/received"));
      const people = asList(r.people);
      set({
        likedYouCount: typeof r.count === "number" ? r.count : 0,
        likedYou: people.length
          ? people.map((e) => mapProfile(asMap(e)))
          : asList(r.previews).map((url, i) => ({
              id: `hidden-${i}`,
              name: "•••••",
              age: 0,
              gender: "other" as const,
              country: { code: "", name: "", flag: "" },
              avatarUrl: String(url),
              bio: "",
              interests: [],
              intent: null,
              verified: false,
              vip: false,
              matches: 0,
              likes: 0,
              level: 1,
            })),
      });
    } catch {}
  };
  const reloadBlocks = async () => {
    try {
      set({ blocked: asList(await api.get("/blocks")).map((e) => String(asMap(e).id)) });
    } catch {}
  };

  return {
    all: [],
    chats: {},
    typing: {},
    seenAt: {},
    blocked: [],
    likedYou: [],
    likedYouCount: 0,
    loaded: false,

    async load() {
      if (!api.hasSession) return;
      await Promise.all([reloadFriends(), reloadLikes(), reloadBlocks()]);
      set({ loaded: true });
    },

    refreshFriends: () => (api.hasSession ? reloadFriends() : Promise.resolve()),

    async ensureMessages(friendId) {
      openChat = friendId;
      if (loadedChats.has(friendId)) return;
      try {
        const page = asMap(await api.get(`/friends/${friendId}/messages`, { limit: 100 }));
        const list = asList(page.items)
          .map((e) => mapMessage(asMap(e), giftById))
          .reverse();
        loadedChats.add(friendId);
        set((s) => ({ chats: { ...s.chats, [friendId]: list } }));
      } catch {}
    },

    leaveChat(friendId) {
      if (openChat === friendId) openChat = null;
    },

    async sendRequest(p) {
      try {
        await api.post(`/friends/${p.id}/request`);
        await reloadFriends();
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return false;
        throw e;
      }
    },

    async accept(id) {
      await api.post(`/friends/${id}/accept`);
      await reloadFriends();
    },

    async decline(id) {
      await api.post(`/friends/${id}/decline`);
      await reloadFriends();
    },

    async remove(id) {
      await api.delete(`/friends/${id}`);
      set((s) => {
        const chats = { ...s.chats };
        delete chats[id];
        return { chats };
      });
      await reloadFriends();
    },

    async block(p) {
      await api.post(`/blocks/${p.id}`);
      set((s) => {
        const chats = { ...s.chats };
        delete chats[p.id];
        return { chats, blocked: [...new Set([...s.blocked, p.id])] };
      });
      await reloadFriends();
    },

    async unblock(id) {
      await api.delete(`/blocks/${id}`);
      set((s) => ({ blocked: s.blocked.filter((x) => x !== id) }));
    },

    async sendMessage(friendId, text, replyToId) {
      if (!text.trim()) return;
      onMessage(asMap(await api.post(`/friends/${friendId}/messages`, { text: text.trim(), ...(replyToId ? { replyToId } : {}) })));
    },

    async sendMedia(friendId, kind, file, info = {}) {
      const tempId = `pending-${Date.now()}`;
      const url = URL.createObjectURL(file);
      const temp: ChatMessage = {
        id: tempId,
        fromMe: true,
        kind,
        meta: kind === "photo" ? { url, w: info.w, h: info.h } : { url, seconds: info.seconds ?? 0 },
        text: kind === "photo" ? "📷 Photo" : "🎤 Voice message",
        at: new Date(),
        pending: true,
      };
      set((s) => ({ chats: { ...s.chats, [friendId]: [...(s.chats[friendId] ?? []), temp] } }));
      const drop = () => set((s) => ({ chats: { ...s.chats, [friendId]: (s.chats[friendId] ?? []).filter((m) => m.id !== tempId) } }));
      const ext = kind === "photo" ? (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg") : file.type.includes("mp4") ? "m4a" : file.type.includes("ogg") ? "ogg" : "webm";
      const fields: Record<string, string> = { kind };
      if (info.seconds != null) fields.seconds = String(Math.round(info.seconds));
      if (info.w && info.h) {
        fields.w = String(Math.round(info.w));
        fields.h = String(Math.round(info.h));
      }
      if (info.replyToId) fields.replyToId = info.replyToId;
      try {
        const m = asMap(await api.upload(`/friends/${friendId}/messages/media`, "file", file, `${kind}.${ext}`, fields));
        drop();
        onMessage(m);
      } catch (e) {
        drop();
        throw e;
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    },

    async react(friendId, messageId, emoji) {
      onUpdated(asMap(await api.put(`/friends/${friendId}/messages/${messageId}/reaction`, { emoji: emoji ?? "" })));
    },

    async unsend(friendId, messageId) {
      onUpdated(asMap(await api.delete(`/friends/${friendId}/messages/${messageId}`)));
    },

    typingTo(friendId) {
      const now = Date.now();
      if ((typingSent[friendId] ?? 0) > now - 3000) return;
      typingSent[friendId] = now;
      api.post(`/friends/${friendId}/typing`).catch(() => {});
    },

    async sendGift(friendId, gift) {
      try {
        onMessage(asMap(await api.post(`/friends/${friendId}/gifts`, { giftId: gift.id }, { "Idempotency-Key": newIdempotencyKey() })));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return false;
        throw e;
      }
    },

    markRead(friendId) {
      const f = get().all.find((x) => x.profile.id === friendId);
      if (f && f.unread > 0) set((s) => ({ all: s.all.map((x) => (x.profile.id === friendId ? { ...x, unread: 0 } : x)) }));
      api.post(`/friends/${friendId}/read`).catch(() => {});
    },

    async restoreStreak(friendId) {
      try {
        const r = asMap(await api.post(`/friends/${friendId}/streak/restore`));
        setStreak(friendId, mapStreak(asMap(r.streak)));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return false;
        if (e instanceof ApiError && e.code === "STREAK_NOT_RESTORABLE") void reloadFriends();
        throw e;
      }
    },

    reset() {
      loadedChats.clear();
      openChat = null;
      set({ all: [], chats: {}, typing: {}, seenAt: {}, blocked: [], likedYou: [], likedYouCount: 0, loaded: false });
    },
  };
});

const typingSent: Record<string, number> = {};

/** A message changed (reaction, unsent): replace it in place. */
function onUpdated(m: Json) {
  const friendId = String(m.friendId);
  const msg = mapMessage(m, giftById);
  useSocial.setState((s) => {
    const list = s.chats[friendId];
    if (!list) return {};
    return { chats: { ...s.chats, [friendId]: list.map((x) => (x.id === msg.id ? { ...msg, gift: x.gift ?? msg.gift } : x.replyTo?.id === msg.id ? { ...x, replyTo: { ...x.replyTo, unsent: !!msg.unsent, text: msg.unsent ? "" : x.replyTo.text } } : x)) } };
  });
}

function onMessage(m: Json) {
  const friendId = String(m.friendId);
  const msg = mapMessage(m, giftById);
  const s = useSocial.getState();
  const list = s.chats[friendId] ?? [];
  if (list.some((x) => x.id === msg.id)) return;
  // Their message ends "typing…".
  if (!msg.fromMe && s.typing[friendId]) {
    const typing = { ...s.typing };
    delete typing[friendId];
    useSocial.setState({ typing });
  }
  const all = s.all.map((f) => {
    if (f.profile.id !== friendId) return f;
    const unread = !msg.fromMe && msg.kind !== "system" && openChat !== friendId ? f.unread + 1 : f.unread;
    return { ...f, lastMessage: msg.gift ? `${msg.gift.emoji} ${msg.gift.name}` : msg.text, unread };
  });
  useSocial.setState({ chats: { ...s.chats, [friendId]: [...list, msg] }, all });
  if (openChat === friendId && !msg.fromMe) s.markRead(friendId);
}

function setStreak(friendId: string, streak: StreakView) {
  useSocial.setState((s) => ({ all: s.all.map((f) => (f.profile.id === friendId ? { ...f, streak } : f)) }));
}

// ── selectors ─────────────────────────────────────────────────────────────

const lastAt = (s: Pick<SocialState, "chats">, f: Friend) => {
  const list = s.chats[f.profile.id];
  return list?.length ? list[list.length - 1].at : f.since;
};

/** Friends, the most recent conversation first. */
export const friendsOf = (s: Pick<SocialState, "all" | "chats">) =>
  s.all
    .filter((f) => f.state === "friends")
    .sort((a, b) => (b.lastMessage == null ? b.since : lastAt(s, b)).getTime() - (a.lastMessage == null ? a.since : lastAt(s, a)).getTime());
export const incomingOf = (s: Pick<SocialState, "all">) => s.all.filter((f) => f.state === "incoming");
export const requestedOf = (s: Pick<SocialState, "all">) => s.all.filter((f) => f.state === "requested");
export const unreadTotal = (s: Pick<SocialState, "all">) => s.all.reduce((a, f) => a + f.unread, 0);
export const friendStateOf = (s: Pick<SocialState, "all" | "blocked">, userId: string): FriendState =>
  s.blocked.includes(userId) ? "blocked" : (s.all.find((f) => f.profile.id === userId)?.state ?? "none");

realtime.on(Ev.message, onMessage);
realtime.on(Ev.messageUpdated, onUpdated);
realtime.on(Ev.chatTyping, (d) => {
  if (typeof d.friendId !== "string") return;
  const id = d.friendId;
  const until = Date.now() + 5000;
  useSocial.setState((s) => ({ typing: { ...s.typing, [id]: until } }));
  setTimeout(() => {
    useSocial.setState((s) => {
      if ((s.typing[id] ?? 0) > Date.now()) return {};
      const typing = { ...s.typing };
      delete typing[id];
      return { typing };
    });
  }, 5100);
});
realtime.on(Ev.messagesRead, (d) => {
  if (typeof d.friendId !== "string") return;
  const id = d.friendId;
  const at = typeof d.at === "string" ? new Date(d.at) : new Date();
  useSocial.setState((s) => ({ seenAt: { ...s.seenAt, [id]: at } }));
});
const reload = () => void useSocial.getState().load();
realtime.on(Ev.friendRequest, reload);
realtime.on(Ev.friendAccepted, reload);
realtime.on(Ev.friendRemoved, reload);
realtime.on(Ev.matchEnded, reload);
realtime.on(Ev.streak, (d) => {
  if (typeof d.friendId === "string") setStreak(d.friendId, mapStreak(asMap(d.streak)));
});
// Presence: `{ userId, online }` (only if the server sends it; GET /friends carries it too).
realtime.on(Ev.presence, (d) => {
  const id = typeof d.userId === "string" ? d.userId : typeof d.friendId === "string" ? d.friendId : null;
  if (!id || typeof d.online !== "boolean") return;
  useSocial.setState((s) => ({ all: s.all.map((f) => (f.profile.id === id ? { ...f, online: d.online === true } : f)) }));
});
