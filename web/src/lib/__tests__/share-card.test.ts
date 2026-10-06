import { describe, expect, it } from "vitest";

import { cardCopy, printableLink, shareText } from "../share-card";

describe("share cards", () => {
  const link = "https://vibe.test/i/K7P2QXM";
  it("writes the text with the invite and its reward", () => {
    expect(shareText({ kind: "level", level: 12 }, link, 50)).toBe(`I'm Level 12 on Vibe 🎉 Meet new people on video — join with my link and get 50 free coins: ${link}`);
    expect(shareText({ kind: "streak", days: 30 }, link, 50)).toMatch(/^Our 30-day streak on Vibe 🔥 .*https:\/\/vibe\.test\/i\/K7P2QXM$/);
    expect(shareText({ kind: "match" }, link, 0)).toBe(`It's a vibe! 💞 Just met someone great on Vibe. Meet new people on video — join with my link: ${link}`);
  });
  it("puts no one else's name on the card", () => {
    expect(cardCopy({ kind: "streak", days: 1 }).sub).toBe("We've talked every day for 1 day.");
    expect(cardCopy({ kind: "level", level: 3 }, "Lumo")).toMatchObject({ title: "I'm Level 3", accent: "on Lumo." });
    expect(cardCopy({ kind: "match" }).accent).toBe("vibe!");
  });
  it("prints the link without scheme or query", () => {
    expect(printableLink(`${link}?s=card`)).toBe("vibe.test/i/K7P2QXM");
  });
});
