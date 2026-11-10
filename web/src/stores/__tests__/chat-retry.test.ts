import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const post = vi.fn();
vi.mock("../services", () => ({
  api: { hasSession: false, get: vi.fn(async () => []), post: (...a: unknown[]) => post(...a), delete: vi.fn(), put: vi.fn() },
  realtime: { on: vi.fn(), onConnectionChange: vi.fn(), request: vi.fn(async () => ({})) },
}));

const { useSocial } = await import("../social");

const sent = { id: "m1", friendId: "u1", kind: "text", text: "are you there?", fromMe: true, createdAt: "2026-11-10T10:00:00Z" };

describe("sending on a weak connection", () => {
  beforeEach(() => {
    post.mockReset();
    useSocial.setState({ chats: {} });
  });

  it("shows the message at once, retries with one key, and it appears once", async () => {
    post.mockRejectedValueOnce(ApiError.network("reset")).mockResolvedValueOnce(sent);
    const sending = useSocial.getState().sendMessage("u1", " are you there? ");
    expect(useSocial.getState().chats.u1).toEqual([expect.objectContaining({ text: "are you there?", pending: true })]);
    await sending;
    expect(post).toHaveBeenCalledTimes(2);
    const keys = post.mock.calls.map((c) => (c[2] as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
    expect(useSocial.getState().chats.u1.map((m) => m.id)).toEqual(["m1"]);
  });

  it("gives up after about half a minute offline and offers a retry", async () => {
    vi.useFakeTimers();
    post.mockRejectedValue(ApiError.network("offline"));
    const sending = useSocial.getState().sendMessage("u1", "hello");
    await vi.runAllTimersAsync();
    await sending;
    const [m] = useSocial.getState().chats.u1;
    expect(m).toMatchObject({ failed: true, pending: false });
    expect(post).toHaveBeenCalledTimes(6);
    vi.useRealTimers();

    post.mockReset().mockResolvedValueOnce({ ...sent, text: "hello" });
    await useSocial.getState().retryMessage("u1", m.id);
    expect(useSocial.getState().chats.u1.map((x) => x.id)).toEqual(["m1"]);
  });

  it("a refusal (not a network problem) takes the message back", async () => {
    post.mockRejectedValueOnce(new ApiError("FORBIDDEN", "You can only message friends", 403));
    await expect(useSocial.getState().sendMessage("u1", "hi")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(useSocial.getState().chats.u1).toEqual([]);
  });
});
