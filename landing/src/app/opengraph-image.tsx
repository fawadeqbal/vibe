import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "Vibe — Meet someone new, right now.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: the two rings and the headline on Vibe's night ground. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 88, background: "radial-gradient(60% 80% at 80% 20%, rgba(139,92,246,0.35), rgba(11,10,16,0) 70%), #0B0A10", color: "#F4F1FA" }}>
        <div style={{ display: "flex", position: "relative", width: 120, height: 80 }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 80, height: 80, borderRadius: 80, border: "10px solid #FF3D8F" }} />
          <div style={{ position: "absolute", left: 40, top: 0, width: 80, height: 80, borderRadius: 80, border: "10px solid #8B5CF6" }} />
        </div>
        <div style={{ marginTop: 48, fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>Meet someone new,</div>
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1.1, color: "#FF7AB3" }}>right now.</div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#B9B3C9" }}>Live video with real, selfie-verified people. Free · 18+</div>
      </div>
    ),
    size,
  );
}
