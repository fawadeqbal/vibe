import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { afterSwipe, type DiscoverStatus, useDiscover } from "../discover";
import { api } from "../services";

const person = (id: string) => ({ profile: { id, name: `P ${id}` }, online: false, sharedInterests: [] });
const statusJson = (likesLeft: number) => ({ enabled: true, likesLeft, freeSuperLikesLeft: 0, likedYou: { count: 0, unseen: 0 }, filters: {} });

/** A promise the test resolves or rejects when it wants: a server that answers later. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

const ids = () => useDiscover.getState().deck.map((c) => c.profile.id);

describe("Discover swipes", () => {
  let deckReply: unknown[] = [];
  const posts: { path: string; body: unknown; answer: ReturnType<typeof later<unknown>> }[] = [];

  beforeEach(async () => {
    useDiscover.getState().reset();
    posts.length = 0;
    deckReply = ["a", "b", "c"].map(person);
    vi.spyOn(api, "hasSession", "get").mockReturnValue(true);
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/discover/deck") return { items: deckReply };
      if (path === "/discover/status") return statusJson(5);
      return {};
    });
    vi.spyOn(api, "post").mockImplementation((path: string, body?: unknown) => {
      const answer = later<unknown>();
      posts.push({ path, body, answer });
      return answer.promise as never;
    });
    await useDiscover.getState().load();
  });
  afterEach(() => vi.restoreAllMocks());

  it("takes the card off and counts the like at once, before the server answers", () => {
    void useDiscover.getState().swipe(useDiscover.getState().deck[0], "like");
    expect(ids()).toEqual(["b", "c"]);
    expect(useDiscover.getState().status?.likesLeft).toBe(4);
  });

  it("never brings back someone whose swipe is still on its way (the refill race)", async () => {
    // The server hasn't saved the swipe yet, so the refill sends "a" again.
    deckReply = ["a", "d"].map(person);
    void useDiscover.getState().swipe(useDiscover.getState().deck[0], "pass");
    await vi.waitFor(() => expect(useDiscover.getState().refilling).toBe(false));
    expect(ids()).toEqual(["b", "c", "d"]);
  });

  it("only the newest answer updates the counters, so they never jump back", async () => {
    const [a, b] = useDiscover.getState().deck;
    const first = useDiscover.getState().swipe(a, "like");
    const second = useDiscover.getState().swipe(b, "like");
    expect(useDiscover.getState().status?.likesLeft).toBe(3);
    const swipes = posts.filter((p) => p.path === "/discover/swipes");
    swipes[1].answer.resolve({ matched: false, status: statusJson(3) });
    await second;
    swipes[0].answer.resolve({ matched: false, status: statusJson(4) }); // late, older answer
    await first;
    expect(useDiscover.getState().status?.likesLeft).toBe(3);
  });

  it("puts the card back on top, marks it to ease in, and restores the counter when the server says no", async () => {
    const a = useDiscover.getState().deck[0];
    const r = useDiscover.getState().swipe(a, "like");
    posts[0].answer.reject(new ApiError("OUT_OF_LIKES", "Out of likes", 429));
    expect(await r).toEqual({ ok: false, reason: "out-of-likes" });
    expect(ids()[0]).toBe("a");
    expect(useDiscover.getState().returnedId).toBe("a");
    expect(useDiscover.getState().status?.likesLeft).toBe(0);
  });

  it("a failed Super Like gives the free one back", async () => {
    useDiscover.setState((s) => ({ status: { ...(s.status as DiscoverStatus), freeSuperLikesLeft: 1 } }));
    const r = useDiscover.getState().swipe(useDiscover.getState().deck[0], "super");
    expect(useDiscover.getState().status?.freeSuperLikesLeft).toBe(0);
    posts[0].answer.reject(new ApiError("INSUFFICIENT_COINS", "Not enough coins", 402));
    expect(await r).toEqual({ ok: false, reason: "coins" });
    expect(useDiscover.getState().status?.freeSuperLikesLeft).toBe(1);
  });

  it("undo waits for the pass to reach the server first", async () => {
    const a = useDiscover.getState().deck[0];
    const pass = useDiscover.getState().swipe(a, "pass");
    expect(useDiscover.getState().lastPassed?.profile.id).toBe("a");
    const undo = useDiscover.getState().undo();
    await Promise.resolve();
    expect(posts.map((p) => p.path)).toEqual(["/discover/swipes"]); // undo not sent yet
    posts[0].answer.resolve({ matched: false, status: statusJson(5) });
    await pass;
    await vi.waitFor(() => expect(posts.map((p) => p.path)).toContain("/discover/undo"));
    posts[1].answer.resolve({ card: person("a"), status: statusJson(5) });
    expect(await undo).toBe("ok");
    expect(ids()[0]).toBe("a");
    expect(useDiscover.getState().returnedId).toBe("a");
  });

  it("counts like the server: a Super Like never uses a daily like", () => {
    const st = { likesLeft: 3, freeSuperLikesLeft: 2 } as DiscoverStatus;
    expect(afterSwipe(st, "like")).toMatchObject({ likesLeft: 2, freeSuperLikesLeft: 2 });
    expect(afterSwipe(st, "super")).toMatchObject({ likesLeft: 3, freeSuperLikesLeft: 1 });
    expect(afterSwipe(st, "pass")).toBe(st);
    expect(afterSwipe({ ...st, likesLeft: null }, "like")).toMatchObject({ likesLeft: null });
  });
});
