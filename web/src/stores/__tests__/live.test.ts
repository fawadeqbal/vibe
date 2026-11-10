import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services", () => ({
  api: { hasSession: false, get: vi.fn(async () => []), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
  realtime: { on: vi.fn(), onConnectionChange: vi.fn(), request: vi.fn(async () => ({})) },
}));

const { bannerFrom, useBanners, BANNER_MS } = await import("../banners");
const { mergeNewest } = await import("../social");
const { notificationPath } = await import("@/lib/notification-path");

const show = (over: Record<string, unknown> = {}) => ({ key: "payment.update", group: "money", title: "Payment received", body: "500 coins added", data: { open: "payment", purchaseId: "p1" }, ...over });

describe("live notification banners", () => {
  afterEach(() => vi.useRealTimers());

  it("builds a banner, but not about the page you're on", () => {
    expect(bannerFrom(show(), "/match", notificationPath)).toMatchObject({ title: "Payment received", body: "500 coins added", data: { open: "payment", purchaseId: "p1" } });
    const chat = show({ key: "chat.message", group: "messages", title: "Sara", body: "hey!", data: { open: "chat", friendId: "u1", messageId: "m9" } });
    expect(bannerFrom(chat, "/chats/u1", notificationPath)).toBeNull();
    expect(bannerFrom(chat, "/chats/u2", notificationPath)).not.toBeNull();
    expect(bannerFrom(show({ title: "" }), "/", notificationPath)).toBeNull();
  });

  it("shows one at a time, queues the rest, and hides by itself", () => {
    vi.useFakeTimers();
    const b = (key: string, friendId = "") => bannerFrom(show({ key, data: { open: "chat", friendId } }), "/", notificationPath)!;
    useBanners.getState().push(b("chat.message", "u1"));
    useBanners.getState().push(b("chat.message", "u2"));
    useBanners.getState().push(b("chat.message", "u2")); // a newer one from u2 replaces the queued one
    expect(useBanners.getState().queue).toHaveLength(1);
    vi.advanceTimersByTime(BANNER_MS);
    expect(useBanners.getState().current?.data.friendId).toBe("u2");
    vi.advanceTimersByTime(BANNER_MS);
    expect(useBanners.getState().current).toBeNull();
  });
});

describe("catching up after a dropped connection", () => {
  const m = (id: string, min: number, extra = {}) => ({ id, fromMe: false, text: id, at: new Date(Date.UTC(2026, 10, 10, 10, min)), ...extra });

  it("keeps older messages, takes the newest page from the server, keeps unsent ones at the bottom", () => {
    const current = [m("a", 1), m("b", 2), m("c", 3, { readAt: null }), m("pending-1", 4, { fromMe: true, pending: true })];
    const fresh = [m("c", 3, { readAt: new Date() }), m("d", 5), m("e", 6)];
    const out = mergeNewest(current, fresh);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e", "pending-1"]);
    expect(out[2].readAt).toBeInstanceOf(Date);
    expect(mergeNewest(current, [])).toBe(current);
  });
});
