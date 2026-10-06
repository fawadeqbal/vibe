import { describe, expect, it } from "vitest";

import {
  captureRef,
  claimErrorMessage,
  deviceId,
  DEVICE_KEY,
  inviteLink,
  inviteMessage,
  type KeyValue,
  milestoneFill,
  normaliseCode,
  normaliseSource,
  personSteps,
  readRef,
  REF_KEY,
  REF_TTL_MS,
  referralOverview,
  rejectReasonLabel,
  signUpFields,
  upsertPerson,
  whatsappUrl,
  withSource,
} from "../referrals";

const memory = (): KeyValue & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
const throwing: KeyValue = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("ref capture", () => {
  const now = Date.UTC(2026, 9, 6, 12);

  it("normalises codes and sources like the server", () => {
    expect(normaliseCode(" k7p2qxm ")).toBe("K7P2QXM");
    expect(normaliseCode("ali_vlogs")).toBe("ALI_VLOGS");
    expect(normaliseCode("ab")).toBeNull();
    expect(normaliseCode("bad code")).toBeNull();
    expect(normaliseCode("x".repeat(21))).toBeNull();
    expect(normaliseSource(" TikTok ")).toBe("tiktok");
    expect(normaliseSource("you tube")).toBeNull();
    expect(normaliseSource("x".repeat(25))).toBeNull();
  });

  it("stores ?ref= / ?s= and strips both from the URL, keeping the rest", () => {
    const kv = memory();
    const { captured, cleaned } = captureRef(new URL("https://app.vibe.test/store?ref=k7p2qxm&s=TikTok&tab=coins#top"), kv, now);
    expect(captured).toEqual({ code: "K7P2QXM", source: "tiktok", at: now });
    expect(cleaned).toBe("/store?tab=coins#top");
    expect(readRef(kv, now + 1000)).toEqual(captured);
  });

  it("leaves the URL alone without ref/s, and drops an invalid code (still stripping it)", () => {
    const kv = memory();
    expect(captureRef(new URL("https://app.vibe.test/match?x=1"), kv, now)).toEqual({ captured: null, cleaned: null });
    const r = captureRef(new URL("https://app.vibe.test/?ref=no!&s=whatsapp"), kv, now);
    expect(r.captured).toBeNull();
    expect(r.cleaned).toBe("/");
    expect(kv.map.has(REF_KEY)).toBe(false);
  });

  it("the newest link wins; a bad source is dropped", () => {
    const kv = memory();
    captureRef(new URL("https://a.test/?ref=FIRST1"), kv, now);
    captureRef(new URL("https://a.test/?ref=second2&s=bad%20source"), kv, now + 5);
    expect(readRef(kv, now + 10)).toEqual({ code: "SECOND2", source: null, at: now + 5 });
  });

  it("expires after 30 days and removes the stale entry", () => {
    const kv = memory();
    captureRef(new URL("https://a.test/?ref=K7P2QXM"), kv, now);
    expect(readRef(kv, now + REF_TTL_MS - 1)).not.toBeNull();
    expect(readRef(kv, now + REF_TTL_MS + 1)).toBeNull();
    expect(kv.map.has(REF_KEY)).toBe(false);
  });

  it("ignores malformed storage and survives blocked storage", () => {
    const kv = memory();
    kv.map.set(REF_KEY, "{not json");
    expect(readRef(kv, now)).toBeNull();
    kv.map.set(REF_KEY, JSON.stringify({ code: "a b", at: now }));
    expect(readRef(kv, now)).toBeNull();
    expect(readRef(throwing, now)).toBeNull();
    expect(captureRef(new URL("https://a.test/?ref=K7P2QXM"), throwing, now).captured?.code).toBe("K7P2QXM");
    expect(readRef(null, now)).toBeNull();
  });

  it("keeps one device id per browser", () => {
    const kv = memory();
    const a = deviceId(kv, () => "11111111-2222-3333-4444-555555555555");
    expect(a).toBe("11111111-2222-3333-4444-555555555555");
    expect(deviceId(kv, () => "should-not-be-used")).toBe(a);
    kv.map.set(DEVICE_KEY, "bad");
    expect(deviceId(kv, () => "ffffffff-0000")).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(deviceId(throwing)).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it("builds the sign-up fields", () => {
    expect(signUpFields({ code: "K7P2QXM", source: "tiktok", at: 0 }, "dev-12345678")).toEqual({ inviteCode: "K7P2QXM", inviteSource: "tiktok", inviteVia: "web", deviceId: "dev-12345678" });
    expect(signUpFields({ code: "ALI", source: null, at: 0 }, null)).toEqual({ inviteCode: "ALI", inviteVia: "web" });
    expect(signUpFields(null, "dev-12345678")).toEqual({ deviceId: "dev-12345678" });
    expect(signUpFields(null, "short")).toEqual({});
  });
});

describe("links and messages", () => {
  it("builds invite links with an optional channel", () => {
    expect(inviteLink("https://vibe.test/", "K7P2QXM")).toBe("https://vibe.test/i/K7P2QXM");
    expect(inviteLink("https://vibe.test", "ALI", "TikTok")).toBe("https://vibe.test/i/ALI?s=tiktok");
    expect(withSource("https://vibe.test/i/ALI?s=youtube", null)).toBe("https://vibe.test/i/ALI");
    expect(withSource("https://vibe.test/i/ALI", "bad source")).toBe("https://vibe.test/i/ALI");
  });

  it("writes the invite message with the reward", () => {
    expect(inviteMessage("https://v.test/i/ALI", 50)).toBe("Come meet new people on Vibe — video chat with real, verified people. Join with my link and get 50 free coins: https://v.test/i/ALI");
    expect(inviteMessage("L", 0)).toMatch(/people\. L$/);
    expect(whatsappUrl("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });

  it("maps claim errors to friendly text", () => {
    expect(claimErrorMessage("INVITE_TOO_LATE")).toMatch(/48 hours/);
    expect(claimErrorMessage("INVITE_SELF")).toMatch(/own code/);
    expect(claimErrorMessage("INVITE_CODE_INVALID")).toMatch(/couldn't find/);
    expect(claimErrorMessage("INVITE_ALREADY_USED")).toMatch(/already joined/);
    expect(claimErrorMessage("RATE_LIMITED", "Slow down")).toBe("Slow down");
  });
});

describe("GET /referrals", () => {
  const person = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
    id,
    profile: { id: `u-${id}`, name: "Sara Khan", age: 22, avatarUrl: "", countryCode: "PK" },
    status: "PENDING",
    rejectReason: null,
    steps: { verified: true, verifyNeeded: true, calls: 2, callsNeeded: 3 },
    coins: 0,
    createdAt,
    qualifiedAt: null,
    rewardedAt: null,
    ...extra,
  });

  it("parses the overview", () => {
    const ov = referralOverview({
      code: "K7P2QXM",
      link: "https://vibe.test/i/K7P2QXM",
      rewards: { inviterCoins: 100, inviteeCoins: 50, activationCalls: 3, requireVerified: true, holdHours: 24 },
      stats: { joined: 2, pending: 1, rewarded: 1, rejected: 0, coinsEarned: 100 },
      milestones: [
        { count: 3, reward: { kind: "vip", amount: 7 }, reached: false },
        { count: 25, reward: { kind: "coins", amount: 1000 }, reached: false },
      ],
      next: { count: 3, remaining: 2 },
      people: [person("a", "2026-10-06T10:00:00Z")],
      affiliate: null,
    });
    expect(ov.rewards.inviteeCoins).toBe(50);
    expect(ov.milestones[1].reward).toEqual({ kind: "coins", amount: 1000 });
    expect(ov.next).toEqual({ count: 3, remaining: 2 });
    expect(ov.people[0].profile.name).toBe("Sara Khan");
    expect(personSteps(ov.people[0])).toBe("Verified ✓ · 2/3 calls");
    expect(ov.affiliate).toBeNull();
    expect(referralOverview({ next: null, affiliate: { code: "ALI", link: "L" } })).toMatchObject({ next: null, affiliate: { code: "ALI", link: "L" } });
  });

  it("upserts a live update and keeps newest first", () => {
    const ov = referralOverview({ people: [person("a", "2026-10-05T10:00:00Z"), person("b", "2026-10-04T10:00:00Z")] });
    const b2 = referralOverview({ people: [person("b", "2026-10-04T10:00:00Z", { status: "REWARDED", coins: 100 })] }).people[0];
    const c = referralOverview({ people: [person("c", "2026-10-06T10:00:00Z")] }).people[0];
    const list = upsertPerson(upsertPerson(ov.people, b2), c);
    expect(list.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(list[2].status).toBe("REWARDED");
  });

  it("explains rejections", () => {
    expect(rejectReasonLabel("same_device")).toMatch(/Same device/);
    expect(rejectReasonLabel("staff: duplicate account")).toBe("duplicate account");
    expect(rejectReasonLabel(null)).toBe("Not eligible");
  });

  it("fills the milestone track", () => {
    expect(milestoneFill([3, 10, 25], 0)).toBe(0);
    expect(milestoneFill([3, 10, 25], 3)).toBeCloseTo(1 / 3);
    expect(milestoneFill([3, 10, 25], 6)).toBeCloseTo(1 / 3 + (3 / 7) / 3);
    expect(milestoneFill([3, 10, 25], 25)).toBe(1);
    expect(milestoneFill([3, 10, 25], 99)).toBe(1);
    expect(milestoneFill([], 5)).toBe(0);
  });
});
