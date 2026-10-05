import { ogImage, ogSize } from "@/lib/og";
import { site } from "@/lib/site";

export const dynamic = "force-static";
export const alt = `${site.name} — free random video chat with verified people`;
export const size = ogSize;
export const contentType = "image/png";

export default function OpengraphImage() {
  return ogImage({ kicker: "Free random video chat", title: "Meet someone new, right now.", subtitle: "Live video with real, selfie-verified people. Free · 18+" });
}
