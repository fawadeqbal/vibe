import { describe, expect, it } from "vitest";

import { captureVisit, readVisit, VISIT_KEY } from "../site-visit";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("site visit attribution", () => {
  it("keeps ?vid= from the marketing site and cleans the URL", () => {
    const kv = memory();
    const now = Date.UTC(2026, 9, 29);
    expect(captureVisit(new URL("https://app.vibe.test/discover?vid=v_abc12345&b=discover_open&ref=ALI#x"), kv, now)).toBe("/discover?ref=ALI#x");
    expect(readVisit(kv, now + 60_000)).toEqual({ id: "v_abc12345", at: now });
    expect(captureVisit(new URL("https://app.vibe.test/match"), kv, now)).toBeNull();
  });

  it("drops bad ids and visits older than two days", () => {
    const kv = memory();
    const now = Date.UTC(2026, 9, 29);
    captureVisit(new URL("https://app.vibe.test/?vid=no!"), kv, now);
    expect(kv.getItem(VISIT_KEY)).toBeNull();
    captureVisit(new URL("https://app.vibe.test/?vid=v_abc12345"), kv, now);
    expect(readVisit(kv, now + 3 * 86_400_000)).toBeNull();
    expect(kv.getItem(VISIT_KEY)).toBeNull();
  });
});
