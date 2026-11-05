import { describe, expect, it } from "vitest";

import { message } from "../mappers";

describe("messages with hidden contact details", () => {
  it("marks a message the server masked", () => {
    const m = message({ id: "m1", fromMe: true, kind: "text", text: "whatsapp me ****", meta: { hidden: true }, at: "2026-11-05T10:00:00Z" }, () => null);
    expect(m).toMatchObject({ text: "whatsapp me ****", hidden: true });
  });

  it("leaves ordinary messages unmarked", () => {
    expect(message({ id: "m2", fromMe: true, kind: "text", text: "hi", meta: null, at: "2026-11-05T10:00:00Z" }, () => null).hidden).toBe(false);
  });
});
