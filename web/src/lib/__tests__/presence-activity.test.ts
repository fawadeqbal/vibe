import { describe, expect, it } from "vitest";

import { activityItem, friend, profileView } from "../api/mappers";
import { presenceLabel } from "../format";
import { notificationPath } from "../notification-path";

const NOW = new Date("2026-11-09T12:00:00Z").getTime();

describe("presenceLabel", () => {
  it("online wins", () => {
    expect(presenceLabel(true, new Date(NOW - 3_600_000), NOW)).toBe("Online");
  });
  it("last seen from when they left", () => {
    expect(presenceLabel(false, new Date(NOW - 20_000), NOW)).toBe("Last seen just now");
    expect(presenceLabel(false, new Date(NOW - 5 * 60_000), NOW)).toBe("Last seen 5m ago");
    expect(presenceLabel(false, new Date(NOW - 3 * 3_600_000), NOW)).toBe("Last seen 3h ago");
  });
  it("says nothing rather than guess", () => {
    expect(presenceLabel(false, null, NOW)).toBeNull();
    expect(presenceLabel(null, undefined, NOW)).toBeNull();
  });
});

describe("friend and profile mappers", () => {
  it("read lastSeenAt, never the friendship date", () => {
    const f = friend({ profile: { id: "u1", name: "Sara" }, state: "friends", since: "2026-01-01T00:00:00Z", lastSeenAt: "2026-11-09T11:55:00Z", online: false });
    expect(f.lastSeenAt?.toISOString()).toBe("2026-11-09T11:55:00.000Z");
    expect(friend({ profile: { id: "u1" }, state: "incoming", since: "2026-01-01T00:00:00Z" }).lastSeenAt).toBeNull();
  });
  it("profile view: met and last seen", () => {
    expect(profileView({ profile: { id: "u1" }, tier: "matched", rel: {}, met: true })).toMatchObject({ met: true, lastSeenAt: null });
    expect(profileView({ profile: { id: "u1" }, tier: "following", rel: { follow: "following" } }).met).toBe(false);
  });
});

describe("activityItem", () => {
  it("maps a person notification with where you stand", () => {
    const i = activityItem({
      id: "a1",
      type: "friend.request",
      title: "New friend request",
      body: "Sara wants to be friends",
      data: { route: "friends", userId: "u1", junk: 5 },
      actor: { id: "u1", name: "Sara Khan" },
      rel: { friend: "incoming", follow: "following", followsYou: true, followRequest: false },
      read: false,
      createdAt: "2026-11-09T11:00:00Z",
    });
    expect(i).toMatchObject({ id: "a1", type: "friend.request", actor: { id: "u1", name: "Sara Khan" }, rel: { friend: "incoming", follow: "following", followsYou: true, followRequest: false }, read: false, data: { route: "friends", userId: "u1" } });
    expect(i.data).not.toHaveProperty("junk");
    expect(i.at.toISOString()).toBe("2026-11-09T11:00:00.000Z");
  });
  it("a collapsed line keeps its count (one per chat)", () => {
    expect(activityItem({ id: "c1", type: "chat.message", count: 3 }).count).toBe(3);
    expect(activityItem({ id: "c2", type: "chat.message" }).count).toBe(1);
  });
  it("Vibe's own notifications have no person", () => {
    expect(activityItem({ id: "a2", type: "payment.update", title: "Payment received", body: "", data: { route: "wallet" }, actor: null, rel: null, read: true })).toMatchObject({ actor: null, rel: null, read: true });
  });
  it("unknown relationship values fall back safely", () => {
    expect(activityItem({ id: "a3", actor: { id: "u" }, rel: { friend: "weird", follow: "x" } }).rel).toEqual({ friend: "none", follow: "none", followsYou: false, followRequest: false });
  });
});

describe("notificationPath", () => {
  it("sends each kind of notification to its screen", () => {
    expect(notificationPath({ route: "friends", userId: "u1" })).toBe("/u/u1");
    expect(notificationPath({ route: "friends" })).toBe("/notifications");
    expect(notificationPath({ route: "notifications" })).toBe("/notifications");
    expect(notificationPath({ route: "inbox" })).toBe("/chats/inbox");
    expect(notificationPath({ route: "chat", friendId: "u2" })).toBe("/chats/u2");
    expect(notificationPath({ route: "profile", userId: "u3" })).toBe("/u/u3");
    expect(notificationPath({ route: "follow-requests", userId: "u4" })).toBe("/me/follows?tab=requests");
    expect(notificationPath({ route: "wallet" })).toBe("/wallet");
    expect(notificationPath({ route: "discover" })).toBe("/discover");
    expect(notificationPath({})).toBe("/match");
  });

  it("opens the exact thing a notification is about (`open`), not where older apps went (`route`)", () => {
    expect(notificationPath({ route: "chat", open: "chat", friendId: "u1", messageId: "m1" })).toBe("/chats/u1?m=m1");
    expect(notificationPath({ route: "chat", open: "calls", userId: "u1", friendId: "u1" })).toBe("/u/u1/calls");
    expect(notificationPath({ route: "chat", open: "profile", userId: "u2", friendId: "u2" })).toBe("/u/u2");
    expect(notificationPath({ route: "discover", open: "liked-you" })).toBe("/discover/liked-you");
    expect(notificationPath({ route: "wallet", open: "payment", purchaseId: "p1" })).toBe("/wallet/payments/p1");
    expect(notificationPath({ route: "wallet", open: "cashout", cashoutId: "c1" })).toBe("/wallet/cashouts/c1");
    expect(notificationPath({ route: "wallet", open: "goals" })).toBe("/wallet#goals");
    expect(notificationPath({ route: "inbox", open: "account" }, "n9")).toBe("/me/status?note=n9");
    expect(notificationPath({ route: "profile", open: "verification", userId: "me" })).toBe("/me/verification");
    expect(notificationPath({ route: "inbox", open: "team", messageId: "x1" })).toBe("/news/x1");
    expect(notificationPath({ route: "inbox", open: "recap" })).toBe("/me/recap");
  });
});
