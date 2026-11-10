import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services", () => ({
  api: { hasSession: false, get: vi.fn(async () => []), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
  realtime: { on: vi.fn(), onConnectionChange: vi.fn(), request: vi.fn(async () => ({})) },
}));

const { bannerFrom, useBanners, MAX_BANNERS } = await import("../banners");
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

  it("stacks newest first; nothing goes away by itself, only when tapped, closed, cleared or opened", () => {
    vi.useFakeTimers();
    const b = (friendId: string) => bannerFrom(show({ key: "chat.message", data: { open: "chat", friendId } }), "/", notificationPath)!;
    const st = () => useBanners.getState();
    st().clear();
    st().push(b("u1"));
    st().push(b("u2"));
    st().push(b("u2")); // a second message from u2 is its own banner
    expect(st().items.map((x) => x.data.friendId)).toEqual(["u2", "u2", "u1"]);
    vi.advanceTimersByTime(60_000);
    expect(st().items).toHaveLength(3);

    st().dismiss(st().items[2].id);
    expect(st().items.map((x) => x.data.friendId)).toEqual(["u2", "u2"]);
    st().push(b("u3"));
    st().setPath("/chats/u2"); // opened that chat: its banners are read
    expect(st().items.map((x) => x.data.friendId)).toEqual(["u3"]);
    st().clear();
    expect(st().items).toEqual([]);

    for (let i = 0; i < MAX_BANNERS + 5; i++) st().push(b(`x${i}`));
    expect(st().items).toHaveLength(MAX_BANNERS);
    expect(st().items[0].data.friendId).toBe(`x${MAX_BANNERS + 4}`);
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
