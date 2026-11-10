import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SOLAR } from "../solar-glyphs";
import { SOLAR_SPRITE_COUNT, SOLAR_SPRITE_URL } from "../solar-sprite-url";

const pub = join(__dirname, "../../../../public");

describe("icon sheet", () => {
  it("has every Solar glyph (re-run scripts/solar-sprite.mjs after adding one)", () => {
    const sheet = readFileSync(join(pub, SOLAR_SPRITE_URL), "utf8");
    const files = readdirSync(join(pub, "icons/solar")).filter((f) => f.endsWith(".svg"));
    expect(files).toHaveLength(SOLAR_SPRITE_COUNT);
    for (const f of files) expect(sheet).toContain(`<symbol id="s-${f.replace(/\.svg$/, "")}"`);
    // Every name the app can ask for has its glyph (the pinned style, or both).
    for (const [name, pinned] of Object.entries(SOLAR)) {
      for (const v of pinned ? [pinned] : ["b", "o"]) expect(sheet, `${name}-${v}`).toContain(`id="s-${name}-${v}"`);
    }
  });
});
