import { describe, expect, it } from "vitest";

import { followEntry, followSettings, followState, profileView } from "../api/mappers";

describe("follow mappers", () => {
  it("matched tier: no counts, no stats", () => {
    const v = profileView({ profile: { id: "u2", name: "Sana" }, tier: "matched", rel: { follow: "requested", followsYou: true, friend: "none" } });
    expect(v).toMatchObject({ tier: "matched", follow: "requested", followsYou: true, friend: "none", counts: null, stats: null, online: null });
    expect(v.profile.name).toBe("Sana");
  });

  it("following tier with hidden stats", () => {
    const v = profileView({ profile: { id: "u2" }, tier: "following", rel: { follow: "following" }, counts: { followers: 12, following: 3 }, stats: "hidden" });
    expect(v).toMatchObject({ counts: { followers: 12, following: 3 }, stats: "hidden" });
  });

  it("friends tier with stats and presence; unknown values fall back", () => {
    const v = profileView({ profile: { id: "u2" }, tier: "friends", rel: { friend: "friends", follow: "bogus" }, counts: { followers: 1, following: 1 }, stats: { matches: 40, likes: 9, gifts: 3 }, online: true });
    expect(v).toMatchObject({ tier: "friends", friend: "friends", follow: "none", stats: { matches: 40, likes: 9, gifts: 3 }, online: true });
    expect(profileView({ profile: { id: "x" }, tier: "admin" }).tier).toBe("matched");
  });

  it("entries, settings and states", () => {
    expect(followEntry({ profile: { id: "u3" }, since: "2026-10-05T10:00:00Z", followsBack: true })).toMatchObject({ profile: { id: "u3" }, followsBack: true });
    expect(followSettings({ followers: 4, following: 1, privateAccount: true })).toEqual({ followers: 4, following: 1, privateAccount: true, hideStats: false });
    expect(followState("following")).toBe("following");
    expect(followState(undefined)).toBe("none");
  });
});
