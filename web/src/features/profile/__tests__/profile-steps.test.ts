import { describe, expect, it } from "vitest";

import { profile } from "@/lib/api/mappers";

import { profileSteps } from "../profile-steps";

const base = profile({ id: "u1", name: "Hira", age: 22 });

describe("profile steps", () => {
  it("starts with the photo and lists all four parts", () => {
    const steps = profileSteps(base);
    expect(steps.map((s) => s.id)).toEqual(["photo", "bio", "interests", "intent"]);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(steps.find((s) => !s.done)?.action).toBe("Add a photo");
  });

  it("counts interests towards three and words the next step", () => {
    const steps = profileSteps({ ...base, avatarUrl: "https://x/y.jpg", bio: "hi", interests: ["Music", "Art"] });
    const interests = steps.find((s) => s.id === "interests")!;
    expect(interests.label).toBe("Interests 2/3");
    expect(steps.find((s) => !s.done)?.action).toBe("Pick 1 more interest");
  });

  it("is done when photo, bio, 3 interests and intent are set", () => {
    const steps = profileSteps({ ...base, avatarUrl: "https://x/y.jpg", bio: "hi", interests: ["Music", "Art", "Tech"], intent: "friends" });
    expect(steps.every((s) => s.done)).toBe(true);
  });
});

describe("intent mapping", () => {
  it("reads known intents and drops anything else", () => {
    expect(profile({ intent: "dating" }).intent).toBe("dating");
    expect(profile({ intent: "marriage" }).intent).toBeNull();
    expect(profile({}).intent).toBeNull();
  });
});
