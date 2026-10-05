import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const ogSize = { width: 1200, height: 630 };

// Satori can't read woff2: TTF copies of the site's Geist weights (SIL OFL).
// Read once at build time (every share card is rendered statically).
const font = (file: string) => readFileSync(join(process.cwd(), "src/lib/og-fonts", file));
const fonts = [
  { name: "Geist", data: font("Geist-SemiBold.ttf"), weight: 600 as const, style: "normal" as const },
  { name: "Geist", data: font("Geist-Bold.ttf"), weight: 700 as const, style: "normal" as const },
];

/**
 * The share card every page uses: the two rings, brand name, a kicker and the
 * page's headline on the night ground. Satori (next/og) supports flexbox only.
 */
export function ogImage({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  const size = title.length > 60 ? 64 : title.length > 40 ? 74 : 86;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, fontFamily: "Geist", background: "radial-gradient(60% 80% at 85% 15%, rgba(139,92,246,0.38), rgba(11,10,16,0) 70%), radial-gradient(50% 60% at 0% 100%, rgba(255,61,143,0.18), rgba(11,10,16,0) 70%), #0B0A10", color: "#F4F1FA" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", position: "relative", width: 84, height: 56 }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 56, height: 56, borderRadius: 56, border: "8px solid #FF3D8F" }} />
            <div style={{ position: "absolute", left: 28, top: 0, width: 56, height: 56, borderRadius: 56, border: "8px solid #8B5CF6" }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{site.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: "#C4B5FD" }}>{kicker}</div>
          <div style={{ marginTop: 20, fontSize: size, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
          {subtitle && <div style={{ marginTop: 26, fontSize: 30, color: "#B9B3C9" }}>{subtitle}</div>}
        </div>
      </div>
    ),
    { ...ogSize, fonts },
  );
}
